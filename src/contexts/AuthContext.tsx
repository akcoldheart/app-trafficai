import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Role, MenuItem } from '@/lib/supabase/types';
import type { UserProfile } from '@/lib/auth';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  userRole: Role | null;
  userMenuItems: MenuItem[];
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  userRole: null,
  userMenuItems: [],
  session: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userMenuItems, setUserMenuItems] = useState<MenuItem[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  // Fetch user profile, role, and menu permissions from database
  const fetchUserData = async (userId: string): Promise<{
    profile: UserProfile | null;
    role: Role | null;
    menuItems: MenuItem[];
  }> => {
    try {
      // Fetch user profile
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, role, role_id')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      if (!userData) return { profile: null, role: null, menuItems: [] };

      const profile = userData as UserProfile;

      // If user has role_id, fetch role and menu items from database
      if (userData.role_id) {
        // Fetch role details
        const { data: roleData } = await supabase
          .from('roles')
          .select('*')
          .eq('id', userData.role_id)
          .single();

        // Fetch menu items for this role via role_permissions
        const { data: permissionsData } = await supabase
          .from('role_permissions')
          .select(`
            menu_item_id,
            menu_items (*)
          `)
          .eq('role_id', userData.role_id);

        const menuItems = (permissionsData || [])
          .map((p: any) => p.menu_items)
          .filter((m: MenuItem | null): m is MenuItem => m !== null && m.is_active)
          .sort((a: MenuItem, b: MenuItem) => a.display_order - b.display_order);

        return {
          profile,
          role: roleData as Role,
          menuItems,
        };
      }

      // Fallback: no role_id set, return empty menu items
      return { profile, role: null, menuItems: [] };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { profile: null, role: null, menuItems: [] };
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const { profile, role, menuItems } = await fetchUserData(session.user.id);
          setUserProfile(profile);
          setUserRole(role);
          setUserMenuItems(menuItems);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const { profile, role, menuItems } = await fetchUserData(session.user.id);
          setUserProfile(profile);
          setUserRole(role);
          setUserMenuItems(menuItems);
        } else {
          setUserProfile(null);
          setUserRole(null);
          setUserMenuItems([]);
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase.auth]);

  const signOut = async () => {
    try {
      // Clear all Supabase cookies immediately
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-') || name.includes('supabase')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        }
      });

      // Clear localStorage items related to supabase
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });

      // Clear sessionStorage as well
      Object.keys(sessionStorage).forEach((key) => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          sessionStorage.removeItem(key);
        }
      });

      // Try to sign out from Supabase (non-blocking)
      supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (err) {
      console.error('Error during signOut cleanup:', err);
    }

    // Use multiple redirect methods to ensure navigation happens
    // Method 1: Try Next.js router first
    router.push('/auth/login').then(() => {
      // Method 2: Force a full page reload after router navigation
      window.location.reload();
    }).catch(() => {
      // Method 3: Fallback to direct location change
      window.location.href = '/auth/login';
    });
  };

  const refreshUser = async () => {
    if (user) {
      const { profile, role, menuItems } = await fetchUserData(user.id);
      setUserProfile(profile);
      setUserRole(role);
      setUserMenuItems(menuItems);
    }
  };

  const value = {
    user,
    userProfile,
    userRole,
    userMenuItems,
    session,
    loading,
    signOut,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
