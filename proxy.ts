import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/secret';
import { openToken } from '@/lib/auth/token';

/**
 * proxy.ts — Next.js 16's replacement for middleware.ts.
 *
 * It does exactly one security job, and it does it without touching the
 * database: verify the HMAC on the session cookie. A forged, expired-shaped or
 * absent cookie is rejected here in microseconds, so an unauthenticated
 * request to /dashboard never boots a server component, never opens a Neon
 * query and never costs a function invocation beyond this one.
 *
 * Full authorisation (does this user own this post?) still happens in the
 * Server Actions — this is a gate, not a guard.
 */

const PROTECTED_PREFIXES = ['/write', '/dashboard', '/saved', '/settings'];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const response = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  response.headers.set('x-folio-edge', '1');

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected) {
    // Pure CPU work — no database round-trip on the hot path.
    const token = await openToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!token) {
      const login = new URL('/login', request.url);
      login.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(login);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except build output and static assets, so the proxy never runs
     * for the hundreds of immutable /_next/static requests a page makes.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|woff2)$).*)',
  ],
};
