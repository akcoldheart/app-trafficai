import crypto from 'crypto';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** SHA256 hash a normalized string. Returns empty string if input is empty/null. */
export function sha256(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  return crypto.createHash('sha256').update(value).digest('hex');
}

// US state name -> 2-letter code mapping
export const US_STATE_MAP: Record<string, string> = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
  'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
  'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
  'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
  'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
  'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
  'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
  'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv',
  'wisconsin': 'wi', 'wyoming': 'wy', 'district of columbia': 'dc',
};

// Country name -> 2-letter ISO code mapping
export const COUNTRY_MAP: Record<string, string> = {
  'united states': 'us', 'united states of america': 'us', 'usa': 'us',
  'canada': 'ca', 'united kingdom': 'uk', 'great britain': 'gb',
  'australia': 'au', 'germany': 'de', 'france': 'fr', 'india': 'in',
  'brazil': 'br', 'mexico': 'mx', 'spain': 'es', 'italy': 'it',
  'netherlands': 'nl', 'japan': 'jp', 'south korea': 'kr',
  'new zealand': 'nz', 'ireland': 'ie', 'sweden': 'se',
  'norway': 'no', 'denmark': 'dk', 'finland': 'fi',
  'switzerland': 'ch', 'austria': 'at', 'belgium': 'be',
  'portugal': 'pt', 'poland': 'pl', 'singapore': 'sg',
  'israel': 'il', 'south africa': 'za', 'argentina': 'ar',
  'chile': 'cl', 'colombia': 'co', 'philippines': 'ph',
  'indonesia': 'id', 'malaysia': 'my', 'thailand': 'th',
  'vietnam': 'vn', 'turkey': 'tr', 'egypt': 'eg',
  'nigeria': 'ng', 'kenya': 'ke', 'uae': 'ae',
  'united arab emirates': 'ae', 'saudi arabia': 'sa',
};

/**
 * Extract pre-computed SHA256 email hashes from enrichment_data.
 * The API provides SHA256_PERSONAL_EMAIL and SHA256_BUSINESS_EMAIL as
 * comma-separated lists of hashes that directly match social profiles.
 */
export function getPreComputedEmailHashes(contact: Record<string, any>): string[] {
  const enrichment = contact.enrichment_data as Record<string, any> | null;
  const extraData = contact.data as Record<string, any> | null;

  const hashes = new Set<string>();

  for (const source of [enrichment, extraData]) {
    if (!source) continue;
    for (const key of [
      'SHA256_PERSONAL_EMAIL', 'sha256_personal_email',
      'SHA256_BUSINESS_EMAIL', 'sha256_business_email',
      'HEM_SHA256', 'hem_sha256',
    ]) {
      const val = source[key];
      if (typeof val === 'string' && val.trim()) {
        for (const h of val.split(',')) {
          const trimmed = h.trim().toLowerCase();
          if (trimmed.length === 64 && /^[0-9a-f]+$/.test(trimmed)) {
            hashes.add(trimmed);
          }
        }
      }
    }
  }

  return Array.from(hashes);
}

/**
 * Build the non-email portion of an upload row (PHONE, FN, LN, CT, ST, COUNTRY, ZIP, GEN).
 * These are hashed since there are no pre-computed hashes for these fields.
 */
export function buildNonEmailFields(contact: Record<string, any>): string[] {
  const enrichment = contact.enrichment_data as Record<string, any> | null;
  const meta = contact.metadata as Record<string, any> | null;
  const extraData = contact.data as Record<string, any> | null;

  // PHONE
  let rawPhone = contact.phone
    || meta?.phone
    || enrichment?.MOBILE_PHONE
    || enrichment?.DIRECT_NUMBER
    || enrichment?.PERSONAL_PHONE
    || enrichment?.ALL_MOBILES?.split(',')[0]
    || '';
  if (typeof rawPhone === 'string') {
    rawPhone = rawPhone.replace(/[\s\-\(\)\.\+]/g, '');
    if (rawPhone.length === 10 && /^\d+$/.test(rawPhone)) {
      rawPhone = '1' + rawPhone;
    }
    if (!/^\d{7,15}$/.test(rawPhone)) rawPhone = '';
  } else {
    rawPhone = '';
  }
  const phone = sha256(rawPhone);

  // FN
  let fn = '';
  if (contact.first_name) {
    fn = contact.first_name.toLowerCase().trim();
  } else if (enrichment?.FIRST_NAME) {
    fn = enrichment.FIRST_NAME.toLowerCase().trim();
  } else if (contact.full_name) {
    fn = contact.full_name.split(/\s+/)[0]?.toLowerCase().trim() || '';
  }
  const fnHash = sha256(fn);

  // LN
  let ln = '';
  if (contact.last_name) {
    ln = contact.last_name.toLowerCase().trim();
  } else if (enrichment?.LAST_NAME) {
    ln = enrichment.LAST_NAME.toLowerCase().trim();
  } else if (contact.full_name) {
    const parts = contact.full_name.trim().split(/\s+/);
    if (parts.length > 1) {
      ln = parts.slice(1).join(' ').toLowerCase().trim();
    }
  }
  const lnHash = sha256(ln);

  // CT
  const rawCity = (contact.city || enrichment?.PERSONAL_CITY || enrichment?.CITY || '')
    .toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, '');
  const ct = sha256(rawCity);

  // ST
  const rawStateInput = (contact.state || enrichment?.PERSONAL_STATE || enrichment?.STATE || '').toLowerCase().trim();
  const rawState = rawStateInput.length > 2
    ? (US_STATE_MAP[rawStateInput] || rawStateInput.substring(0, 2))
    : rawStateInput;
  const st = sha256(rawState);

  // COUNTRY
  let rawCountry = (contact.country || enrichment?.COUNTRY || '').toLowerCase().trim();
  if (rawCountry.length > 2) {
    rawCountry = COUNTRY_MAP[rawCountry] || rawCountry.substring(0, 2);
  }
  const country = sha256(rawCountry);

  // ZIP
  let rawZip = '';
  const metaZip = enrichment?.PERSONAL_ZIP
    || enrichment?.COMPANY_ZIP
    || meta?.zip || meta?.postal_code
    || extraData?.zip || extraData?.postal_code
    || contact.zip || contact.postal_code || '';
  if (typeof metaZip === 'string' && metaZip.trim()) {
    rawZip = metaZip.toLowerCase().trim();
    if (rawCountry === 'us' && rawZip.length > 5) {
      rawZip = rawZip.substring(0, 5);
    }
  }
  const zip = sha256(rawZip);

  // GEN
  let rawGender = (meta?.gender || enrichment?.GENDER || extraData?.gender || '').toLowerCase().trim();
  if (rawGender === 'male') rawGender = 'm';
  else if (rawGender === 'female') rawGender = 'f';
  else if (rawGender !== 'm' && rawGender !== 'f') rawGender = '';
  const gen = sha256(rawGender);

  return [phone, fnHash, lnHash, ct, st, country, zip, gen];
}

/**
 * Convert a contact into one or more upload rows for hashed audience matching.
 * Uses pre-computed SHA256 hashes when available, falls back to hashing stored email.
 * Returns multiple rows when a contact has multiple email hashes.
 */
export function normalizeContact(contact: Record<string, any>): { rows: string[][]; usedPrecomputed: boolean } {
  const nonEmailFields = buildNonEmailFields(contact);

  const precomputed = getPreComputedEmailHashes(contact);
  if (precomputed.length > 0) {
    const rows = precomputed.map(hash => [hash, ...nonEmailFields]);
    return { rows, usedPrecomputed: true };
  }

  const rawEmail = (contact.email || '').toLowerCase().trim();
  const emailHash = EMAIL_REGEX.test(rawEmail) ? sha256(rawEmail) : '';
  if (!emailHash) {
    return { rows: [], usedPrecomputed: false };
  }

  return { rows: [[emailHash, ...nonEmailFields]], usedPrecomputed: false };
}

/**
 * Extract a raw phone number from a contact's various data sources.
 * Returns the raw string (not hashed, not formatted) or empty string.
 */
export function extractRawPhone(contact: Record<string, any>): string {
  const enrichment = contact.enrichment_data as Record<string, any> | null;
  const meta = contact.metadata as Record<string, any> | null;

  const rawPhone = contact.phone
    || meta?.phone
    || enrichment?.MOBILE_PHONE
    || enrichment?.DIRECT_NUMBER
    || enrichment?.PERSONAL_PHONE
    || enrichment?.ALL_MOBILES?.split(',')[0]
    || '';

  if (typeof rawPhone !== 'string') return '';
  return rawPhone.trim();
}
