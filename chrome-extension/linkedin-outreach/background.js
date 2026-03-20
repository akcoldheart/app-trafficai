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
  const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '';

  // Use the Voyager API to resolve the profile slug to a member URN
  // This returns the target profile's data, not the viewer's
  return fetch(`/voyager/api/identity/profiles/${profileSlug}/networkinfo`, {
    headers: {
      'Accept': 'application/vnd.linkedin.normalized+json+2.1',
      'csrf-token': csrfToken,
    },
    credentials: 'same-origin',
  })
    .then(async r => {
      console.log('[TrafficAI Injected] networkinfo status:', r.status);

      if (r.ok) {
        const data = await r.json();
        // Look for the profile's entityUrn in included
        const included = data?.included || [];
        for (const item of included) {
          const urn = item?.entityUrn || '';
          // Find the miniProfile for this specific slug
          if (item?.publicIdentifier === profileSlug && urn.includes('fs_miniProfile:')) {
            const id = urn.split(':').pop();
            console.log('[TrafficAI Injected] Found target miniProfile:', id);
            return { id, type: 'fs_miniProfile' };
          }
        }
        // Broader search in included
        for (const item of included) {
          if (item?.publicIdentifier === profileSlug) {
            const urn = item?.entityUrn || item?.objectUrn || '';
            const id = urn.split(':').pop();
            if (id) {
              console.log('[TrafficAI Injected] Found target profile:', id, 'from', urn);
              return { id, type: urn.includes('miniProfile') ? 'fs_miniProfile' : 'fsd_profile' };
            }
          }
        }
        console.log('[TrafficAI Injected] Slug not found in included. Items:', included.length);
      }

      // Fallback: try the profile contacts API
      const r2 = await fetch(`/voyager/api/identity/profiles/${profileSlug}`, {
        headers: {
          'Accept': 'application/vnd.linkedin.normalized+json+2.1',
          'csrf-token': csrfToken,
        },
        credentials: 'same-origin',
      });
      console.log('[TrafficAI Injected] profiles/ status:', r2.status);

      if (r2.ok) {
        const data2 = await r2.json();
        const urn = data2?.data?.entityUrn || '';
        if (urn) {
          const id = urn.split(':').pop();
          console.log('[TrafficAI Injected] Found from profiles/:', id, urn);
          return { id, type: urn.includes('miniProfile') ? 'fs_miniProfile' : 'fsd_profile' };
        }
        // Check included
        for (const item of (data2?.included || [])) {
          if (item?.publicIdentifier === profileSlug) {
            const iurn = item?.entityUrn || '';
            const id = iurn.split(':').pop();
            if (id) {
              console.log('[TrafficAI Injected] Found in profiles/ included:', id);
              return { id, type: 'fs_miniProfile' };
            }
          }
        }
      }

      console.log('[TrafficAI Injected] Could not resolve profile');
      return null;
    })
    .catch(err => {
      console.error('[TrafficAI Injected] Resolve error:', err.message);
      return null;
    });
}

function injectedSendConnection(profileSlug, memberId, urnType, message) {
  console.log('[TrafficAI Injected] Sending to slug:', profileSlug, 'memberId:', memberId);
  const csrfToken = document.cookie.match(/JSESSIONID="?([^";]+)/)?.[1] || '';

  // Navigate to profile page and click Connect programmatically
  // This is the most reliable approach as it uses LinkedIn's own UI flow
  return new Promise(async (resolve) => {
    try {
      // Step 1: Load profile page to get the correct action data
      const profileResp = await fetch(`/voyager/api/identity/profiles/${profileSlug}/profileActions`, {
        headers: {
          'Accept': 'application/vnd.linkedin.normalized+json+2.1',
          'csrf-token': csrfToken,
        },
        credentials: 'same-origin',
      });

      // Step 2: Try multiple invitation body formats
      const formats = [
        // Format 1: profileId with invitee wrapper (LinkedIn classic)
        {
          invitee: {
            'com.linkedin.voyager.growth.invitation.InviteeProfile': {
              profileId: profileSlug,
            },
          },
          ...(message ? { message: message.trim().slice(0, 300) } : {}),
        },
        // Format 2: Direct URN with fsd_profile
        {
          inviteeProfileUrn: `urn:li:fsd_profile:${memberId}`,
          ...(message ? { message: message.trim().slice(0, 300) } : {}),
        },
        // Format 3: Direct URN with fs_miniProfile
        {
          inviteeProfileUrn: `urn:li:fs_miniProfile:${memberId}`,
          ...(message ? { message: message.trim().slice(0, 300) } : {}),
        },
      ];

      for (let i = 0; i < formats.length; i++) {
        const body = formats[i];
        console.log(`[TrafficAI Injected] Attempt ${i + 1}:`, JSON.stringify(body).slice(0, 200));

        const r = await fetch('/voyager/api/growth/normInvitations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.linkedin.normalized+json+2.1',
            'X-Restli-Protocol-Version': '2.0.0',
            'csrf-token': csrfToken,
          },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });

        console.log(`[TrafficAI Injected] Attempt ${i + 1} status:`, r.status);

        if (r.ok || r.status === 201) {
          resolve({ success: true });
          return;
        }

        if (r.status !== 422 && r.status !== 400) {
          const text = await r.text().catch(() => '');
          console.log(`[TrafficAI Injected] Attempt ${i + 1} error:`, text.slice(0, 300));
          resolve({ success: false, error: `HTTP ${r.status}` });
          return;
        }
      }

      resolve({ success: false, error: 'All invitation formats returned 422' });
    } catch (err) {
      console.error('[TrafficAI Injected] Send error:', err);
      resolve({ success: false, error: err.message });
    }
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

  // Send connection request — pass the slug for profileId-based invitation
  const result = await executeInLinkedInTab(tabId, injectedSendConnection, [slug, memberId, urnType, message]);
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
