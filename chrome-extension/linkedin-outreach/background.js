// Traffic AI LinkedIn Outreach - Background Service Worker
// Uses chrome.scripting.executeScript to run LinkedIn API calls in a LinkedIn tab context
// so cookies are automatically included by the browser.

const TRAFFICAI_DEFAULT_URL = 'https://app.trafficai.io';

// ─── LinkedIn Session Check ─────────────────────────────────────────────────

async function getLinkedInSession() {
  const cookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
  const li_at = cookies.find(c => c.name === 'li_at')?.value;
  const jsessionid = cookies.find(c => c.name === 'JSESSIONID')?.value?.replace(/"/g, '');
  if (!li_at || !jsessionid) return null;
  return { li_at, jsessionid, csrf_token: jsessionid };
}

// ─── TrafficAI API ──────────────────────────────────────────────────────────

async function getConfig() {
  const result = await chrome.storage.local.get(['apiUrl', 'apiToken']);
  return {
    apiUrl: result.apiUrl || TRAFFICAI_DEFAULT_URL,
    apiToken: result.apiToken || null,
  };
}

async function apiFetch(path, options = {}) {
  const { apiUrl, apiToken } = await getConfig();
  if (!apiToken) throw new Error('Not authenticated');

  const resp = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
      ...(options.headers || {}),
    },
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(data.error || `API error: ${resp.status}`);
  }

  return resp.json();
}

// ─── Find or create a LinkedIn tab for executing API calls ──────────────────

async function getLinkedInTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  if (tabs.length > 0) return tabs[0];

  // Open LinkedIn in background
  const tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false });
  // Wait for it to load
  await new Promise(resolve => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
  return tab;
}

// ─── Execute LinkedIn API call in tab context ───────────────────────────────

async function executeInLinkedInTab(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return results[0]?.result;
}

// Functions to inject into LinkedIn tab
function injectedResolveProfile(profileSlug) {
  return fetch(`/voyager/api/identity/profiles/${profileSlug}`, {
    headers: {
      'Accept': 'application/vnd.linkedin.normalized+json+2.1',
      'X-Restli-Protocol-Version': '2.0.0',
      'csrf-token': document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '',
    },
    credentials: 'same-origin',
  })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return null;
      const urn = data?.data?.entityUrn || data?.entityUrn || '';
      return urn.split(':').pop() || null;
    })
    .catch(() => null);
}

function injectedSendConnection(memberId, message) {
  const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '';
  const body = {
    trackingId: Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0')).join(''),
    inviteeProfileUrn: `urn:li:fsd_profile:${memberId}`,
  };
  if (message && message.trim()) {
    body.message = message.trim().slice(0, 300);
  }

  return fetch('/voyager/api/growth/normInvitations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.linkedin.normalized+json+2.1',
      'X-Restli-Protocol-Version': '2.0.0',
      'csrf-token': csrfToken,
    },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
    .then(r => {
      if (r.ok || r.status === 201) return { success: true };
      return r.json().catch(() => ({})).then(d => ({
        success: false,
        error: d?.message || d?.status || `HTTP ${r.status}`,
      }));
    })
    .catch(err => ({ success: false, error: err.message }));
}

// ─── High-level send function ───────────────────────────────────────────────

function extractProfileSlug(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const match = parsed.pathname.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function personalizeMessage(template, contact) {
  if (!template) return null;
  const firstName = contact.full_name?.split(' ')[0] || '';
  const lastName = contact.full_name?.split(' ').slice(1).join(' ') || '';
  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{last_name\}/gi, lastName)
    .replace(/\{full_name\}/gi, contact.full_name || '')
    .replace(/\{email\}/gi, contact.contact_email || '')
    .trim()
    .slice(0, 300);
}

async function sendConnectionRequest(tabId, linkedinUrl, message) {
  const slug = extractProfileSlug(linkedinUrl);
  if (!slug) return { success: false, error: 'Invalid LinkedIn URL' };

  // Resolve profile in LinkedIn tab context
  const memberId = await executeInLinkedInTab(tabId, injectedResolveProfile, [slug]);
  if (!memberId) return { success: false, error: `Could not resolve profile: ${slug}` };

  // Send connection request in LinkedIn tab context
  const result = await executeInLinkedInTab(tabId, injectedSendConnection, [memberId, message]);
  return result || { success: false, error: 'No result from injection' };
}

// ─── Main processing loop ───────────────────────────────────────────────────

async function processQueue() {
  const { apiToken } = await getConfig();
  if (!apiToken) {
    updateBadge('!', '#FF4444');
    return { status: 'not_authenticated' };
  }

  const session = await getLinkedInSession();
  if (!session) {
    updateBadge('!', '#FF8800');
    return { status: 'no_linkedin_session', message: 'Please log into LinkedIn' };
  }

  try {
    const data = await apiFetch('/api/integrations/linkedin/extension/pending');

    if (!data.contacts || data.contacts.length === 0) {
      updateBadge('', '#2FCB72');
      return { status: 'no_pending', message: data.message || 'No pending contacts' };
    }

    // Get or open a LinkedIn tab
    const tab = await getLinkedInTab();
    if (!tab?.id) {
      return { status: 'error', message: 'Could not open LinkedIn tab' };
    }

    const results = [];
    let sentCount = 0;

    for (const contact of data.contacts) {
      // Add jitter between requests (8-30 seconds)
      if (sentCount > 0) {
        const jitter = 8000 + Math.random() * 22000;
        await new Promise(r => setTimeout(r, jitter));
      }

      const message = personalizeMessage(data.campaign?.connection_message, contact);
      const result = await sendConnectionRequest(tab.id, contact.linkedin_url, message);

      // Report result to API
      try {
        await apiFetch('/api/integrations/linkedin/extension/report', {
          method: 'POST',
          body: JSON.stringify({
            contact_id: contact.id,
            campaign_id: contact.campaign_id,
            status: result.success ? 'sent' : 'error',
            error_message: result.error || null,
          }),
        });
      } catch (reportErr) {
        console.error('Failed to report result:', reportErr);
      }

      if (result.success) sentCount++;
      results.push({ contact_id: contact.id, ...result });

      if (result.error?.includes('401') || result.error?.includes('403')) break;
    }

    updateBadge(sentCount > 0 ? String(sentCount) : '', sentCount > 0 ? '#0A66C2' : '#2FCB72');

    await chrome.storage.local.set({
      lastRun: new Date().toISOString(),
      lastResult: { sent: sentCount, total: data.contacts.length, results },
    });

    return { status: 'completed', sent: sentCount, total: data.contacts.length };
  } catch (err) {
    console.error('Process queue error:', err);
    updateBadge('!', '#FF4444');
    return { status: 'error', message: err.message };
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// ─── Alarm handling ─────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'processQueue') {
    await processQueue();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('processQueue', { periodInMinutes: 30 });
  updateBadge('', '#666666');
});

// ─── Message handling (from popup) ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processNow') {
    processQueue().then(sendResponse);
    return true;
  }

  if (message.action === 'getStatus') {
    (async () => {
      const session = await getLinkedInSession();
      const { apiToken } = await getConfig();
      const storage = await chrome.storage.local.get(['lastRun', 'lastResult']);
      sendResponse({
        linkedinConnected: !!session,
        apiConnected: !!apiToken,
        lastRun: storage.lastRun || null,
        lastResult: storage.lastResult || null,
      });
    })();
    return true;
  }

  if (message.action === 'saveConfig') {
    chrome.storage.local.set({
      apiUrl: message.apiUrl,
      apiToken: message.apiToken,
    }).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'disconnect') {
    chrome.storage.local.remove(['apiToken', 'apiUrl', 'lastRun', 'lastResult'])
      .then(() => {
        updateBadge('', '#666666');
        sendResponse({ success: true });
      });
    return true;
  }
});
