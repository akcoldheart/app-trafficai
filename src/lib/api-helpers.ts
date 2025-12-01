import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import type { UserRole, Database, Json } from './supabase/types';

export interface ApiError {
  error: string;
  code?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * Get authenticated user from API request
 * Returns the user or sends 401 response
 */
export async function getAuthenticatedUser(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabase = createClient(req, res);
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    }

    return user;
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
    return null;
  }
}

/**
 * Get user profile with role
 */
export async function getUserProfile(
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse
): Promise<UserProfile> {
  const supabase = createClient(req, res);
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as UserProfile;
}

/**
 * Check if user has required role
 */
export async function requireRole(
  req: NextApiRequest,
  res: NextApiResponse,
  requiredRole: UserRole | UserRole[]
) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return null;

  try {
    const profile = await getUserProfile(user.id, req, res);
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!roles.includes(profile.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return null;
    }

    return { user, profile };
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
    return null;
  }
}

/**
 * Get user's Traffic AI API key
 */
export async function getUserApiKey(
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse
): Promise<string | null> {
  const supabase = createClient(req, res);
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return (data as { api_key: string }).api_key;
}

/**
 * Log user action to audit log
 */
export async function logAuditAction(
  userId: string,
  action: string,
  req: NextApiRequest,
  res: NextApiResponse,
  resourceType?: string | null,
  resourceId?: string | null,
  metadata?: Record<string, unknown>
) {
  const supabase = createClient(req, res);
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    resource_type: resourceType || null,
    resource_id: resourceId || null,
    metadata: (metadata as Json) || null,
  });
}
