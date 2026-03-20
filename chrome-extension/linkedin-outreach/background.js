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
  console.log('[TrafficAI Injected] Resolving profile:', profileSlug);

  // Navigate to the profile page in a hidden iframe or fetch the HTML
  // to extract the member ID from the page's embedded data
  return fetch(`/in/${profileSlug}/`, {
    credentials: 'same-origin',
    headers: { 'Accept': 'text/html' },
  })
    .then(r => {
      console.log('[TrafficAI Injected] Profile page status:', r.status);
      if (!r.ok) return null;
      return r.text();
    })
    .then(html => {
      if (!html) return null;

      // LinkedIn embeds profile data in the page HTML
      // Look for different URN patterns and return with type info

      const fsdMatch = html.match(/urn:li:fsd_profile:([A-Za-z0-9_-]+)/);
      if (fsdMatch) {
        console.log('[TrafficAI Injected] Found fsd_profile ID:', fsdMatch[1]);
        return { id: fsdMatch[1], type: 'fsd_profile' };
      }

      const miniMatch = html.match(/urn:li:fs_miniProfile:([A-Za-z0-9_-]+)/);
      if (miniMatch) {
        console.log('[TrafficAI Injected] Found miniProfile ID:', miniMatch[1]);
        return { id: miniMatch[1], type: 'fs_miniProfile' };
      }

      const memberMatch = html.match(/urn:li:member:(\d+)/);
      if (memberMatch) {
        console.log('[TrafficAI Injected] Found member ID:', memberMatch[1]);
        return { id: memberMatch[1], type: 'member' };
      }

      console.log('[TrafficAI Injected] No member ID found in HTML (length:', html.length, ')');
      // Log a sample of the HTML to debug
      const urnSamples = html.match(/urn:li:[a-z_]+:[A-Za-z0-9_-]+/g);
      console.log('[TrafficAI Injected] URN samples found:', urnSamples?.slice(0, 5));
      return null;
    })
    .catch(err => {
      console.error('[TrafficAI Injected] Profile resolve error:', err.message);
      return null;
    });
}

function injectedSendConnection(memberId, urnType, message) {
  console.log('[TrafficAI Injected] Sending connection to:', memberId, 'urnType:', urnType, 'message:', message?.slice(0, 50));
  const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '';

  const trackingId = btoa(String(Date.now())).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);

  // Build the correct URN based on what we extracted
  let profileUrn;
  if (urnType === 'fsd_profile') {
    profileUrn = `urn:li:fsd_profile:${memberId}`;
  } else if (urnType === 'member') {
    profileUrn = `urn:li:fsd_profile:${memberId}`;
  } else {
    // fs_miniProfile ID — convert to fsd_profile format
    profileUrn = `urn:li:fsd_profile:${memberId}`;
  }

  const body = {
    inviteeProfileUrn: profileUrn,
    trackingId: trackingId,
  };
  if (message && message.trim()) {
    body.message = message.trim().slice(0, 300);
  }

  console.log('[TrafficAI Injected] Invitation body:', JSON.stringify(body));

  // Try the normInvitations endpoint first
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
    .then(async r => {
      console.log('[TrafficAI Injected] normInvitations status:', r.status);
      if (r.ok || r.status === 201) return { success: true };

      const text = await r.text().catch(() => '');
      console.log('[TrafficAI Injected] normInvitations error:', text.slice(0, 300));

      // If 422, try the older relationship endpoint
      if (r.status === 422) {
        console.log('[TrafficAI Injected] Trying relationships/invite endpoint...');
        const altBody = {
          emberEntityName: 'growth/invitation/norm-invitation',
          invitee: {
            'com.linkedin.voyager.growth.invitation.InviteeProfile': {
              profileId: memberId,
            },
          },
          trackingId: trackingId,
        };
        if (message && message.trim()) {
          altBody.message = message.trim().slice(0, 300);
        }

        const altR = await fetch('/voyager/api/growth/normInvitations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.linkedin.normalized+json+2.1',
            'csrf-token': csrfToken,
          },
          credentials: 'same-origin',
          body: JSON.stringify(altBody),
        });

        console.log('[TrafficAI Injected] Alt endpoint status:', altR.status);
        if (altR.ok || altR.status === 201) return { success: true };

        const altText = await altR.text().catch(() => '');
        console.log('[TrafficAI Injected] Alt error:', altText.slice(0, 300));
      }

      try {
        const d = JSON.parse(text);
        return { success: false, error: d?.message || d?.status || `HTTP ${r.status}` };
      } catch {
        return { success: false, error: `HTTP ${r.status}` };
      }
    })
    .catch(err => {
      console.error('[TrafficAI Injected] Send error:', err);
      return { success: false, error: err.message };
    });
}

// ─── High-level send function ───────────────────────────────────────────────

function extractProfileSlug(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Only personal profiles (/in/slug) can receive connection requests
    // Skip company pages (/company/), school pages (/school/), etc.
    const match = parsed.pathname.match(/\/in\/([^\/]+)/);
    if (!match) {
      console.log(`[TrafficAI] Skipping non-profile URL: ${url}`);
      return null;
    }
    return match[1];
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

  // Resolve profile in LinkedIn tab context — returns { id, type }
  const resolved = await executeInLinkedInTab(tabId, injectedResolveProfile, [slug]);
  if (!resolved) return { success: false, error: `Could not resolve profile: ${slug}` };

  const memberId = typeof resolved === 'string' ? resolved : resolved.id;
  const urnType = typeof resolved === 'string' ? 'fsd_profile' : (resolved.type || 'fsd_profile');

  // Send connection request in LinkedIn tab context
  const result = await executeInLinkedInTab(tabId, injectedSendConnection, [memberId, urnType, message]);
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
    console.log('[TrafficAI] Getting LinkedIn tab...');
    const tab = await getLinkedInTab();
    if (!tab?.id) {
      console.error('[TrafficAI] Could not open LinkedIn tab');
      return { status: 'error', message: 'Could not open LinkedIn tab' };
    }
    console.log('[TrafficAI] Using LinkedIn tab:', tab.id, tab.url);

    const results = [];
    let sentCount = 0;

    for (const contact of data.contacts) {
      // Add jitter between requests (8-30 seconds)
      if (sentCount > 0) {
        const jitter = 8000 + Math.random() * 22000;
        await new Promise(r => setTimeout(r, jitter));
      }

      console.log(`[TrafficAI] Sending to: ${contact.full_name} (${contact.linkedin_url})`);
      const message = personalizeMessage(data.campaign?.connection_message, contact);
      const result = await sendConnectionRequest(tab.id, contact.linkedin_url, message);
      console.log(`[TrafficAI] Result:`, JSON.stringify(result));

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
