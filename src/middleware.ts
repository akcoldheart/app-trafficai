import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for pixel tracking routes (public API)
  if (pathname === '/pixel.js' || pathname.startsWith('/api/pixel')) {
    return NextResponse.next();
  }

  // Skip auth for Stripe webhook (uses signature verification instead)
  if (pathname === '/api/stripe/webhook') {
    return NextResponse.next();
  }

  // Skip auth for cron jobs (uses CRON_SECRET verification instead)
  if (pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  // Skip auth for referral click tracking (public endpoint)
  if (pathname === '/api/referrals/track-click') {
    return NextResponse.next();
  }

  // Capture referral code from ?ref= query parameter and store in cookie
  const refCode = request.nextUrl.searchParams.get('ref');
  if (refCode) {
    // Strip the ref param and redirect to clean URL
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete('ref');
    const response = NextResponse.redirect(cleanUrl);

    // Set referral cookie (30-day expiry, readable by JS for signup page)
    response.cookies.set('ref_code', refCode, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      sameSite: 'lax',
      httpOnly: false, // Signup page needs to read this client-side
    });

    return response;
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images/ (public images)
     * - pixel.js (tracking pixel script)
     * - api/pixel (pixel tracking API)
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon.ico|images/|pixel\\.js|api/pixel|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
