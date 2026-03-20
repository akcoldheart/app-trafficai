// Traffic AI LinkedIn Outreach - Background Service Worker
// Navigates to LinkedIn profile pages and uses content script to click Connect

const TRAFFICAI_DEFAULT_URL = 'https://app.trafficai.io';

// ─── LinkedIn Session Check ─────────────────────────────────────────────────

async function getLinkedInSession() {
  const cookies = await chrome.cookies.getAll({ domain: '.linkedin.com' });
  const li_at = cookies.find(c => c.name === 'li_at')?.value;
  if (!li_at) return null;
  return { li_at };
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

// ─── Profile URL handling ───────────────────────────────────────────────────

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

// ─── Send connection request by navigating to profile ───────────────────────

async function sendConnectionRequest(linkedinUrl, message) {
  const slug = extractProfileSlug(linkedinUrl);
  if (!slug) return { success: false, error: 'Invalid LinkedIn URL' };

  const profileUrl = `https://www.linkedin.com/in/${slug}/`;
  console.log(`[TrafficAI] Navigating to profile: ${profileUrl}`);

  // Open profile in an active tab (loads faster than background)
  const tab = await chrome.tabs.create({ url: profileUrl, active: true });

  try {
    // Wait for page to load (30s timeout for slow connections)
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        // Don't reject — try to proceed anyway, page might be partially loaded
        resolve();
      }, 30000);

      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeout);
          // Give extra time for LinkedIn's JS to render the Connect button
          setTimeout(resolve, 3000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Send message to content script to click Connect
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Content script timeout' });
      }, 15000);

      chrome.tabs.sendMessage(tab.id, {
        action: 'sendConnectionRequest',
        message: message || null,
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response from content script' });
        }
      });
    });

    console.log(`[TrafficAI] Result for ${slug}:`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`[TrafficAI] Error for ${slug}:`, err.message);
    return { success: false, error: err.message };
  } finally {
    // Close the tab after processing
    try {
      await chrome.tabs.remove(tab.id);
    } catch {}
  }
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

    console.log(`[TrafficAI] Processing ${data.contacts.length} contacts...`);
    const results = [];
    let sentCount = 0;

    for (const contact of data.contacts) {
      // Skip non-profile URLs
      if (!contact.linkedin_url?.includes('/in/')) {
        console.log(`[TrafficAI] Skipping non-profile URL: ${contact.linkedin_url}`);
        try {
          await apiFetch('/api/integrations/linkedin/extension/report', {
            method: 'POST',
            body: JSON.stringify({
              contact_id: contact.id,
              campaign_id: contact.campaign_id,
              status: 'error',
              error_message: 'Not a personal LinkedIn profile URL',
            }),
          });
        } catch {}
        continue;
      }

      // Add jitter between requests (10-30 seconds)
      if (sentCount > 0) {
        const jitter = 10000 + Math.random() * 20000;
        console.log(`[TrafficAI] Waiting ${Math.round(jitter/1000)}s before next request...`);
        await new Promise(r => setTimeout(r, jitter));
      }

      console.log(`[TrafficAI] Sending to: ${contact.full_name} (${contact.linkedin_url})`);
      const message = personalizeMessage(data.campaign?.connection_message, contact);
      const result = await sendConnectionRequest(contact.linkedin_url, message);
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
        console.error('[TrafficAI] Failed to report result:', reportErr);
      }

      if (result.success) sentCount++;
      results.push({ contact_id: contact.id, ...result });
    }

    updateBadge(sentCount > 0 ? String(sentCount) : '', sentCount > 0 ? '#0A66C2' : '#2FCB72');

    await chrome.storage.local.set({
      lastRun: new Date().toISOString(),
      lastResult: { sent: sentCount, total: data.contacts.length, results },
    });

    return { status: 'completed', sent: sentCount, total: data.contacts.length };
  } catch (err) {
    console.error('[TrafficAI] Process queue error:', err);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
