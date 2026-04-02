import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Role, MenuItem } from '@/lib/supabase/types';
import type { UserProfile } from '@/lib/auth';

export interface TeamContext {
  teamId: string | null;
  teamName: string | null;
  isOwner: boolean;
  isMember: boolean;
  teamRole: 'owner' | 'admin' | 'member' | null;
  memberCount: number;
  maxSeats: number;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  userRole: Role | null;
  userMenuItems: MenuItem[];
  teamContext: TeamContext | null;
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
  teamContext: null,
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
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  // Fetch user profile, role, and menu permissions via API (bypasses RLS)
  const fetchUserData = async (userId: string): Promise<{
    profile: UserProfile | null;
    role: Role | null;
    menuItems: MenuItem[];
    teamContext: TeamContext | null;
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
        teamContext: data.teamContext as TeamContext | null,
      };
    } catch (error) {
      console.error('Error fetching user data:', error);
      return { profile: null, role: null, menuItems: [], teamContext: null };
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
          const userData = await fetchUserData(session.user.id);
          setUserProfile(userData.profile);
          setUserRole(userData.role);
          setUserMenuItems(userData.menuItems);
          setTeamContext(userData.teamContext);
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
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Attribute referral on first sign-in if ref_code cookie exists
          if (event === 'SIGNED_IN') {
            try {
              const refCodeMatch = document.cookie.match(/(^| )ref_code=([^;]+)/);
              const refCode = refCodeMatch ? decodeURIComponent(refCodeMatch[2]) : null;
              if (refCode) {
                await fetch('/api/referrals/attribute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ref_code: refCode,
                    user_id: session.user.id,
                    user_email: session.user.email,
                  }),
                });
              }
            } catch {
              // Don't block auth flow if attribution fails
            }
          }

          const userData = await fetchUserData(session.user.id);
          setUserProfile(userData.profile);
          setUserRole(userData.role);
          setUserMenuItems(userData.menuItems);
          setTeamContext(userData.teamContext);
        } else {
          setUserProfile(null);
          setUserRole(null);
          setUserMenuItems([]);
          setTeamContext(null);
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
    setTeamContext(null);
    setSession(null);

    if (typeof window !== 'undefined') {
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
    }
  };

  const refreshUser = async () => {
    if (user) {
      const userData = await fetchUserData(user.id);
      setUserProfile(userData.profile);
      setUserRole(userData.role);
      setUserMenuItems(userData.menuItems);
      setTeamContext(userData.teamContext);
    }
  };

  const value = {
    user,
    userProfile,
    userRole,
    userMenuItems,
    teamContext,
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
