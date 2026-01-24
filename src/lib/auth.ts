import type { User } from '@supabase/supabase-js';
import type { UserRole, Role, MenuItem } from './supabase/types';

/**
 * Auth utility functions
 */

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  role_id: string | null;
}

export interface UserRoleData {
  role: Role | null;
  menuItems: MenuItem[];
}

/**
 * Check if user has a specific role
 */
export function hasRole(user: UserProfile | null, role: UserRole): boolean {
  return user?.role === role;
}

/**
 * Check if user is an admin
 */
export function isAdmin(user: UserProfile | null): boolean {
  return hasRole(user, 'admin');
}

/**
 * Check if user is a team member
 */
export function isTeam(user: UserProfile | null): boolean {
  return hasRole(user, 'team');
}

/**
 * Check if user is a standard user
 */
export function isUser(user: UserProfile | null): boolean {
  return hasRole(user, 'user');
}

/**
 * Check if user requires approval for creating resources (non-admin)
 */
export function requiresApproval(user: UserProfile | null): boolean {
  return !isAdmin(user);
}

/**
 * Check if user has admin or team role
 */
export function isAdminOrTeam(user: UserProfile | null): boolean {
  return isAdmin(user) || isTeam(user);
}

/**
 * Get user display name
 */
export function getUserDisplayName(user: UserProfile | User | null): string {
  if (!user) return 'Guest';

  if ('email' in user && user.email) {
    return user.email.split('@')[0];
  }

  return 'User';
}

/**
 * Role display names
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  team: 'Team',
  user: 'User',
};

/**
 * Get role label
 */
export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

/**
 * Get role badge color class
 */
export function getRoleBadgeClass(role: UserRole): string {
  const classes: Record<UserRole, string> = {
    admin: 'bg-danger',
    team: 'bg-primary',
    user: 'bg-info',
  };
  return classes[role];
}
