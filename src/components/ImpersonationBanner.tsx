import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { IconUserExclamation } from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';

export default function ImpersonationBanner() {
  const { userProfile } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);

  useEffect(() => {
    setIsImpersonating(localStorage.getItem('impersonating') === 'true');
    setAdminEmail(localStorage.getItem('impersonator_email'));
  }, []);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    const supabase = createClient();

    // Clear impersonation flags
    localStorage.removeItem('impersonating');
    localStorage.removeItem('impersonator_email');

    // Sign out and redirect to login
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/auth/login';
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
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff',
          padding: '4px 16px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          marginLeft: '8px',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
      >
        Exit Impersonation
      </button>
    </div>
  );
}
