import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { UserRole, Database, Json, Role } from './supabase/types';

export interface ApiError {
  error: string;
  code?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  role_id: string | null;
}

export interface UserProfileWithRole extends UserProfile {
  roleData: Role | null;
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
  // Use service role client to bypass RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, role_id')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as UserProfile;
}

/**
 * Get user profile with full role data from database
 */
export async function getUserProfileWithRole(
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse
): Promise<UserProfileWithRole | null> {
  const supabase = createClient(req, res);

  // Get user with role_id
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email, role, role_id')
    .eq('id', userId)
    .single();

  if (userError || !userData) return null;

  // If user has role_id, fetch the role data
  let roleData: Role | null = null;
  if (userData.role_id) {
    const { data: role } = await supabase
      .from('roles')
      .select('*')
      .eq('id', userData.role_id)
      .single();
    roleData = role;
  }

  return {
    ...(userData as UserProfile),
    roleData,
  };
}

/**
 * Check if user has required role
 * Supports both string role names and database role IDs
 */
export async function requireRole(
  req: NextApiRequest,
  res: NextApiResponse,
  requiredRole: UserRole | UserRole[] | string | string[]
) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return null;

  try {
    // Use service role client to bypass RLS for role checks
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    // Get user with role information
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, role, role_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData) {
      res.status(500).json({ error: 'Failed to fetch user profile' });
      return null;
    }

    // Check role_id first (database-driven)
    if (userData.role_id) {
      const { data: roleData } = await supabase
        .from('roles')
        .select('name')
        .eq('id', userData.role_id)
        .single();

      if (roleData && roles.includes(roleData.name)) {
        return {
          user,
          profile: userData as UserProfile,
          roleName: roleData.name
        };
      }
    }

    // Fallback to string role field for backward compatibility
    if (userData.role && roles.includes(userData.role)) {
      return {
        user,
        profile: userData as UserProfile,
        roleName: userData.role
      };
    }

    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
    return null;
  }
}

/**
 * Get user's Traffic AI API key
 * Uses service role to bypass RLS for reliable key retrieval
 */
export async function getUserApiKey(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _req?: NextApiRequest,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _res?: NextApiResponse
): Promise<string | null> {
  // Use service role client to bypass RLS for reliable API key retrieval
  const { createClient: createServiceClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching API key for user', userId, ':', error.message);
    return null;
  }

  if (!data) return null;
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

/**
 * Create an admin notification
 */
export async function createAdminNotification(
  req: NextApiRequest,
  res: NextApiResponse,
  type: string,
  title: string,
  message: string,
  referenceId?: string,
  referenceType?: string
) {
  const supabase = createClient(req, res);
  const { error } = await supabase.from('admin_notifications').insert({
    type,
    title,
    message,
    reference_id: referenceId || null,
    reference_type: referenceType || null,
    is_read: false,
  });

  if (error) {
    console.error('Failed to create admin notification:', error);
  }
}

/**
 * Team context for the current user
 */
export interface TeamContext {
  effectiveUserId: string;
  isTeamMember: boolean;
  isTeamOwner: boolean;
  teamId: string | null;
  teamRole: 'owner' | 'admin' | 'member' | null;
}

// Simple in-memory cache for team context (30s TTL)
const teamContextCache = new Map<string, { data: TeamContext; expires: number }>();

/**
 * Get the effective user ID for data access.
 * If the user is a team member, returns the team owner's user_id.
 * If the user is a team owner or has no team, returns their own user_id.
 */
export async function getEffectiveUserId(userId: string): Promise<string> {
  const ctx = await getTeamContext(userId);
  return ctx.effectiveUserId;
}

/**
 * Get full team context for the current user.
 * Cached for 30 seconds to avoid repeated DB queries.
 */
export async function getTeamContext(userId: string): Promise<TeamContext> {
  // Check cache
  const cached = teamContextCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if user owns a team
  const { data: ownedTeam } = await supabase
    .from('teams')
    .select('id')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (ownedTeam) {
    const result: TeamContext = {
      effectiveUserId: userId,
      isTeamMember: false,
      isTeamOwner: true,
      teamId: ownedTeam.id,
      teamRole: 'owner',
    };
    teamContextCache.set(userId, { data: result, expires: Date.now() + 30000 });
    return result;
  }

  // Check if user is a member of a team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (membership) {
    // Resolve team owner's user_id
    const { data: team } = await supabase
      .from('teams')
      .select('owner_user_id')
      .eq('id', membership.team_id)
      .single();

    if (team) {
      const result: TeamContext = {
        effectiveUserId: team.owner_user_id,
        isTeamMember: true,
        isTeamOwner: false,
        teamId: membership.team_id,
        teamRole: membership.role as 'admin' | 'member',
      };
      teamContextCache.set(userId, { data: result, expires: Date.now() + 30000 });
      return result;
    }
  }

  // No team association
  const result: TeamContext = {
    effectiveUserId: userId,
    isTeamMember: false,
    isTeamOwner: false,
    teamId: null,
    teamRole: null,
  };
  teamContextCache.set(userId, { data: result, expires: Date.now() + 30000 });
  return result;
}

/**
 * Clear team context cache for a user (call after team membership changes)
 */
export function clearTeamContextCache(userId?: string) {
  if (userId) {
    teamContextCache.delete(userId);
  } else {
    teamContextCache.clear();
  }
}

/**
 * Check if user is an admin
 */
export async function isUserAdmin(
  userId: string,
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const supabase = createClient(req, res);
  const { data: userData } = await supabase
    .from('users')
    .select('role_id')
    .eq('id', userId)
    .single();

  if (!userData?.role_id) return false;

  const { data: roleData } = await supabase
    .from('roles')
    .select('name')
    .eq('id', userData.role_id)
    .single();

  return roleData?.name === 'admin';
}
