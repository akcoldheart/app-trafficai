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

  // Fetch user profile, role, and menu permissions via API (bypasses RLS)
  const fetchUserData = async (userId: string): Promise<{
    profile: UserProfile | null;
    role: Role | null;
    menuItems: MenuItem[];
  }> => {
    try {
      // Use the assign-role API endpoint which uses service role to bypass RLS
      const response = await fetch('/api/auth/assign-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error from assign-role API:', errorData);
        throw new Error(errorData.error || 'Failed to fetch user data');
      }

      const data = await response.json();

      return {
        profile: data.profile as UserProfile,
        role: data.role as Role,
        menuItems: (data.menuItems || []) as MenuItem[],
      };
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
      // Sign out from Supabase first (this clears the session properly)
      await supabase.auth.signOut({ scope: 'local' });
    } catch (err) {
      console.error('Error during Supabase signOut:', err);
    }

    // Clear state
    setUser(null);
    setUserProfile(null);
    setUserRole(null);
    setUserMenuItems([]);
    setSession(null);

    try {
      // Clear Supabase cookies
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-') || name.includes('supabase')) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        }
      });

      // Clear localStorage items related to supabase session (but not auth settings)
      Object.keys(localStorage).forEach((key) => {
        // Only clear session-related items, not PKCE verifiers or other auth config
        if (key.startsWith('sb-') && (key.includes('-auth-token') || key.includes('session'))) {
          localStorage.removeItem(key);
        }
      });

      // Clear auth-related sessionStorage
      sessionStorage.removeItem('authRedirect');
    } catch (err) {
      console.error('Error during signOut cleanup:', err);
    }

    // Redirect to login page with a full navigation (clears any stale React state)
    window.location.href = '/auth/login';
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
