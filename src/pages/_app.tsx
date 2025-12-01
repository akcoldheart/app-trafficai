import { useEffect } from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { AuthProvider } from '@/contexts/AuthContext';

// Import Bootstrap and Tabler CSS
import '@tabler/core/dist/css/tabler.min.css';
import '@tabler/core/dist/css/tabler-themes.min.css';
import '@/styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  // Load Bootstrap JS on client-side only
  useEffect(() => {
    // Dynamically import Bootstrap JS for client-side functionality
    if (typeof window !== 'undefined') {
      // @ts-ignore - Bootstrap JS is imported for side effects only
      import('bootstrap/dist/js/bootstrap.bundle.min.js');
    }
  }, []);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
      </Head>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  );
}
