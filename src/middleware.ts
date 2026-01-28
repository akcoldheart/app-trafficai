import { updateSession } from '@/lib/supabase/middleware';
import { type NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for pixel tracking routes (public API)
  if (pathname === '/pixel.js' || pathname.startsWith('/api/pixel')) {
    return NextResponse.next();
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
    '/((?!_next/static|_next/image|favicon.ico|images/|pixel\\.js|api/pixel|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
