import { useEffect } from 'react';
import { useRouter } from 'next/router';

// Redirect /partner/dashboard to the main dashboard
export default function PartnerDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return null;
}
