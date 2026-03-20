import crypto from 'crypto';

const LINKEDIN_BASE = 'https://www.linkedin.com';

export interface LinkedInSession {
  li_at: string;
  jsessionid: string;
  csrf_token: string;
}

interface ConnectionResult {
  success: boolean;
  error?: string;
}

function decrypt(encryptedText: string): string {
  if (encryptedText.startsWith('b64:')) {
    return Buffer.from(encryptedText.slice(4), 'base64').toString('utf8');
  }
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY not configured');
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Extract LinkedIn member ID from a profile URL.
 * Handles formats like:
 *   https://www.linkedin.com/in/john-doe
 *   https://www.linkedin.com/in/john-doe/
 *   https://linkedin.com/in/john-doe
 */
function extractProfileSlug(linkedinUrl: string): string | null {
  try {
    const url = new URL(linkedinUrl.startsWith('http') ? linkedinUrl : `https://${linkedinUrl}`);
    const match = url.pathname.match(/\/in\/([^\/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Login to LinkedIn and get session cookies.
 * Uses LinkedIn's authentication endpoint.
 */
export async function loginToLinkedIn(
  encryptedEmail: string,
  encryptedPassword: string
): Promise<LinkedInSession> {
  const email = decrypt(encryptedEmail);
  const password = decrypt(encryptedPassword);

  // Step 1: Get initial cookies and CSRF token
  const loginPageResp = await fetch(`${LINKEDIN_BASE}/login`, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    redirect: 'manual',
  });

  const cookies = loginPageResp.headers.getSetCookie?.() || [];
  const bcookie = cookies.find(c => c.startsWith('bcookie='))?.split(';')[0] || '';
  const bscookie = cookies.find(c => c.startsWith('bscookie='))?.split(';')[0] || '';
  const jsessionid = cookies.find(c => c.startsWith('JSESSIONID='))?.split(';')[0]?.split('=')[1]?.replace(/"/g, '') || '';

  // Step 2: Login
  const loginResp = await fetch(`${LINKEDIN_BASE}/uas/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'X-Li-User-Agent': 'LIAuthLibrary:0.0.3 com.linkedin.android:4.1.881 Asus_ASUS_Z01QD:android_9',
      'Cookie': [bcookie, bscookie, `JSESSIONID="${jsessionid}"`].filter(Boolean).join('; '),
      'csrf-token': jsessionid,
    },
    body: new URLSearchParams({
      session_key: email,
      session_password: password,
      loginCsrfParam: jsessionid,
    }).toString(),
    redirect: 'manual',
  });

  const loginCookies = loginResp.headers.getSetCookie?.() || [];
  const li_at = loginCookies.find(c => c.startsWith('li_at='))?.split(';')[0]?.split('=').slice(1).join('=') || '';

  if (!li_at) {
    const status = loginResp.status;
    throw new Error(`LinkedIn login failed (status ${status}). Check credentials or LinkedIn may require verification.`);
  }

  const newJsessionid = loginCookies.find(c => c.startsWith('JSESSIONID='))?.split(';')[0]?.split('=')[1]?.replace(/"/g, '') || jsessionid;

  return {
    li_at,
    jsessionid: newJsessionid,
    csrf_token: newJsessionid,
  };
}

/**
 * Resolve a LinkedIn profile slug to a member URN.
 */
async function resolveProfileUrn(session: LinkedInSession, profileSlug: string): Promise<string | null> {
  const resp = await fetch(
    `${LINKEDIN_BASE}/voyager/api/identity/profiles/${profileSlug}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': `li_at=${session.li_at}; JSESSIONID="${session.jsessionid}"`,
        'csrf-token': session.csrf_token,
        'Accept': 'application/vnd.linkedin.normalized+json+2.1',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    }
  );

  if (!resp.ok) return null;

  const data = await resp.json();
  // The profile entityUrn looks like "urn:li:fs_profile:ACoAABxxxxxx"
  // We need the member URN which is "urn:li:fsd_profile:ACoAABxxxxxx"
  const entityUrn = data?.data?.entityUrn || data?.entityUrn || '';
  const memberId = entityUrn.split(':').pop();
  return memberId || null;
}

/**
 * Send a LinkedIn connection request to a profile.
 */
export async function sendConnectionRequest(
  session: LinkedInSession,
  linkedinUrl: string,
  message?: string | null
): Promise<ConnectionResult> {
  const profileSlug = extractProfileSlug(linkedinUrl);
  if (!profileSlug) {
    return { success: false, error: 'Invalid LinkedIn URL' };
  }

  try {
    // Resolve profile to get member ID
    const memberId = await resolveProfileUrn(session, profileSlug);
    if (!memberId) {
      return { success: false, error: `Could not resolve profile: ${profileSlug}` };
    }

    // Send connection invitation
    const invitationBody: Record<string, unknown> = {
      trackingId: crypto.randomBytes(8).toString('hex'),
      inviteeProfileUrn: `urn:li:fsd_profile:${memberId}`,
    };

    if (message && message.trim()) {
      invitationBody.message = message.trim().slice(0, 300); // LinkedIn max is 300 chars
    }

    const resp = await fetch(
      `${LINKEDIN_BASE}/voyager/api/growth/normInvitations`,
      {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/json',
          'Cookie': `li_at=${session.li_at}; JSESSIONID="${session.jsessionid}"`,
          'csrf-token': session.csrf_token,
          'Accept': 'application/vnd.linkedin.normalized+json+2.1',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(invitationBody),
      }
    );

    if (resp.ok || resp.status === 201) {
      return { success: true };
    }

    const errorData = await resp.json().catch(() => null);
    const errorMsg = errorData?.message || errorData?.status || `HTTP ${resp.status}`;
    return { success: false, error: errorMsg };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Replace template variables in connection message.
 */
export function personalizeMessage(
  template: string,
  contact: {
    full_name?: string | null;
    contact_email?: string | null;
    linkedin_url?: string | null;
  }
): string {
  const firstName = contact.full_name?.split(' ')[0] || '';
  const lastName = contact.full_name?.split(' ').slice(1).join(' ') || '';

  return template
    .replace(/\{first_name\}/gi, firstName)
    .replace(/\{last_name\}/gi, lastName)
    .replace(/\{full_name\}/gi, contact.full_name || '')
    .replace(/\{email\}/gi, contact.contact_email || '')
    .trim()
    .slice(0, 300); // LinkedIn limit
}
