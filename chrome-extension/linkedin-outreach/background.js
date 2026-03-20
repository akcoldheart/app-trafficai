// Traffic AI LinkedIn Outreach - Background Service Worker

const TRAFFICAI_DEFAULT_URL = 'https://app.trafficai.io';
const LINKEDIN_BASE = 'https://www.linkedin.com';

// ─── LinkedIn Session ───────────────────────────────────────────────────────

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

// ─── LinkedIn Voyager API ───────────────────────────────────────────────────

async function resolveProfileSlug(session, profileSlug) {
  const resp = await fetch(
    `${LINKEDIN_BASE}/voyager/api/identity/profiles/${profileSlug}`,
    {
      headers: {
        'User-Agent': navigator.userAgent,
        'Cookie': `li_at=${session.li_at}; JSESSIONID="${session.jsessionid}"`,
        'csrf-token': session.csrf_token,
        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  if (!resp.ok) return null;
  const data = await resp.json();
  const entityUrn = data?.data?.entityUrn || data?.entityUrn || '';
  return entityUrn.split(':').pop() || null;
}

function extractProfileSlug(url) {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    const match = parsed.pathname.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function sendConnectionRequest(session, linkedinUrl, message) {
  const slug = extractProfileSlug(linkedinUrl);
  if (!slug) return { success: false, error: 'Invalid LinkedIn URL' };

  const memberId = await resolveProfileSlug(session, slug);
  if (!memberId) return { success: false, error: `Could not resolve profile: ${slug}` };

  const body = {
    trackingId: crypto.randomUUID().replace(/-/g, '').slice(0, 16),
    inviteeProfileUrn: `urn:li:fsd_profile:${memberId}`,
  };

  if (message && message.trim()) {
    body.message = message.trim().slice(0, 300);
  }

  const resp = await fetch(
    `${LINKEDIN_BASE}/voyager/api/growth/normInvitations`,
    {
      method: 'POST',
      headers: {
        'User-Agent': navigator.userAgent,
        'Content-Type': 'application/json',
        'Cookie': `li_at=${session.li_at}; JSESSIONID="${session.jsessionid}"`,
        'csrf-token': session.csrf_token,
        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    }
  );

  if (resp.ok || resp.status === 201) {
    return { success: true };
  }

  const errorData = await resp.json().catch(() => null);
  return { success: false, error: errorData?.message || `HTTP ${resp.status}` };
}

// ─── Message personalization ────────────────────────────────────────────────

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

// ─── Main processing loop ───────────────────────────────────────────────────

async function processQueue() {
  const { apiToken } = await getConfig();
  if (!apiToken) {
    updateBadge('!', '#FF4444');
    return { status: 'not_authenticated' };
  }

  // Check LinkedIn session
  const session = await getLinkedInSession();
  if (!session) {
    updateBadge('!', '#FF8800');
    return { status: 'no_linkedin_session', message: 'Please log into LinkedIn' };
  }

  try {
    // Fetch pending contacts from API
    const data = await apiFetch('/api/integrations/linkedin/extension/pending');

    if (!data.contacts || data.contacts.length === 0) {
      updateBadge('', '#2FCB72');
      return { status: 'no_pending', message: data.message || 'No pending contacts' };
    }

    const results = [];
    let sentCount = 0;

    for (const contact of data.contacts) {
      // Add jitter between requests (8-30 seconds)
      if (sentCount > 0) {
        const jitter = 8000 + Math.random() * 22000;
        await new Promise(r => setTimeout(r, jitter));
      }

      // Personalize message
      const message = personalizeMessage(data.campaign?.connection_message, contact);

      // Send connection request
      const result = await sendConnectionRequest(session, contact.linkedin_url, message);

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

      if (result.success) {
        sentCount++;
      }

      results.push({ contact_id: contact.id, ...result });

      // Stop on auth errors
      if (result.error?.includes('401') || result.error?.includes('403')) {
        break;
      }
    }

    updateBadge(sentCount > 0 ? String(sentCount) : '', sentCount > 0 ? '#0A66C2' : '#2FCB72');

    // Store last run info
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

// Set up alarm (every 30 minutes)
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
