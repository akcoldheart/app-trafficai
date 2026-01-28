import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Database } from './types';

/**
 * Create a Supabase client for use in API Routes (Pages Router)
 * This client works with NextApiRequest/NextApiResponse for session management
 */
export function createClient(req: NextApiRequest, res: NextApiResponse) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Object.keys(req.cookies).map(name => ({
            name,
            value: req.cookies[name] || '',
          }));
        },
        setAll(cookiesToSet) {
          // Collect all cookies and set them together to avoid overwriting
          const cookieStrings = cookiesToSet.map(({ name, value, options }) =>
            serialize(name, value, options)
          );
          res.setHeader('Set-Cookie', cookieStrings);
        },
      },
    }
  );
}

// Simple cookie serializer
function serialize(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

  return parts.join('; ');
}
