/**
 * Traffic AI API Service
 * Handles all API calls to the Traffic AI backend
 */

const BASE_URL = 'https://v3-api-job-72802495918.us-east1.run.app';

// Types
export interface Audience {
  id: string;
  audienceId?: string;
  name: string;
  total_records?: number;
  created_at?: string;
  filters?: Record<string, unknown>;
  segment?: string;
  days_back?: number;
}

export interface AudiencesResponse {
  Data: Audience[];
  total_records: number;
  page: number;
  page_size: number;
}

export interface AudienceResponse {
  audience: Audience;
  contacts?: Contact[];
  total_records: number;
}

export interface Contact {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  linkedin_url?: string;
  [key: string]: unknown;
}

export interface CreditsResponse {
  credits: number;
  available?: number;
}

export interface EnrichFilter {
  email?: string;
  linkedin_url?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
}

export interface EnrichOptions {
  request_id?: string;
  fields?: string[];
  is_or_match?: boolean;
}

export interface CreateAudienceData {
  name: string;
  filters: Record<string, unknown>;
  segment?: string | string[];
  days_back?: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

// API Key Management
export function getApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('traffic_api_key') || '';
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('traffic_api_key', key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

// Generic fetch wrapper with auth
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('API key not configured. Please set your API key in Settings.');
  }

  const config: RequestInit = {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ==================== AUDIENCES ====================

/**
 * Get all audiences (paginated)
 */
export async function getAudiences(page = 1, pageSize = 100): Promise<AudiencesResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return request<AudiencesResponse>(`/audiences?${params}`, { method: 'GET' });
}

/**
 * Get audience by ID
 */
export async function getAudience(id: string, page = 1, pageSize = 100): Promise<AudienceResponse> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  return request<AudienceResponse>(`/audiences/${id}?${params}`, { method: 'GET' });
}

/**
 * Create a new audience
 */
export async function createAudience(data: CreateAudienceData): Promise<Audience> {
  return request<Audience>('/audiences', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Create a custom audience
 */
export async function createCustomAudience(topic: string, description: string): Promise<Audience> {
  return request<Audience>('/audiences/custom', {
    method: 'POST',
    body: JSON.stringify({ topic, description }),
  });
}

/**
 * Delete an audience
 */
export async function deleteAudience(id: string): Promise<void> {
  return request<void>(`/audiences/${id}`, { method: 'DELETE' });
}

/**
 * Get audience attributes
 */
export async function getAudienceAttributes(
  attribute: 'sic' | 'industries' | 'departments' | 'seniority' | 'gender' | 'segments'
): Promise<string[]> {
  return request<string[]>(`/audiences/attributes/${attribute}`, { method: 'GET' });
}

// ==================== ENRICH ====================

/**
 * Enrich contact data
 */
export async function enrichContact(filter: EnrichFilter, options: EnrichOptions = {}): Promise<Contact> {
  const data = {
    filter,
    request_id: options.request_id || `req_${Date.now()}`,
    is_or_match: options.is_or_match || false,
    ...(options.fields && options.fields.length > 0 ? { fields: options.fields } : {}),
  };

  return request<Contact>('/enrich', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== USER CREDITS ====================

/**
 * Get user credits
 */
export async function getCredits(): Promise<CreditsResponse> {
  return request<CreditsResponse>('/user/credits', { method: 'POST' });
}

/**
 * Add credits to user
 */
export async function addCredits(amount: number): Promise<CreditsResponse> {
  return request<CreditsResponse>('/user/credits/add', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

// ==================== UTILITIES ====================

/**
 * Test API connection
 */
export async function testConnection(): Promise<ConnectionTestResult> {
  try {
    await getCredits();
    return { success: true, message: 'Connection successful' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
  }
}

// Export all as TrafficAPI namespace for compatibility
export const TrafficAPI = {
  getApiKey,
  setApiKey,
  hasApiKey,
  testConnection,
  getAudiences,
  getAudience,
  createAudience,
  createCustomAudience,
  deleteAudience,
  getAudienceAttributes,
  enrichContact,
  getCredits,
  addCredits,
};

export default TrafficAPI;
