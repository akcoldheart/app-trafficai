import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { IconUserExclamation, IconLoader2 } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';

export default function ImpersonationBanner() {
  const { userProfile } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    setIsImpersonating(localStorage.getItem('impersonating') === 'true');
    setAdminEmail(localStorage.getItem('impersonator_email'));
  }, []);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    setExiting(true);
    const supabase = createClient();

    try {
      const backup = localStorage.getItem('admin_session_backup');

      // Clear impersonation flags
      localStorage.removeItem('impersonating');
      localStorage.removeItem('impersonator_email');

      // Sign out the impersonated user session
      await supabase.auth.signOut({ scope: 'local' });

      if (backup) {
        const { access_token, refresh_token } = JSON.parse(backup);
        localStorage.removeItem('admin_session_backup');

        // Restore the admin session
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });

        if (!error) {
          // Redirect back to admin users page
          window.location.href = '/admin/users';
          return;
        }
        console.error('Failed to restore admin session:', error);
      }

      // If restore failed, redirect to login
      window.location.href = '/auth/login';
    } catch (err) {
      console.error('Error exiting impersonation:', err);
      localStorage.removeItem('admin_session_backup');
      window.location.href = '/auth/login';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(135deg, #d63939, #e25050)',
        color: '#fff',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: 500,
        boxShadow: '0 2px 8px rgba(214, 57, 57, 0.3)',
      }}
    >
      <IconUserExclamation size={18} />
      <span>
        You are viewing as <strong>{userProfile?.email || 'user'}</strong>
        {adminEmail && <> (impersonated by {adminEmail})</>}
      </span>
      <button
        onClick={handleExit}
        disabled={exiting}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          padding: '4px 16px',
          borderRadius: '6px',
          cursor: exiting ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          marginLeft: '8px',
          opacity: exiting ? 0.7 : 1,
        }}
        onMouseOver={(e) => !exiting && (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
        onMouseOut={(e) => !exiting && (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
      >
        {exiting ? (
          <><IconLoader2 size={14} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: 4 }} />Restoring...</>
        ) : (
          'Exit Impersonation'
        )}
      </button>
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
