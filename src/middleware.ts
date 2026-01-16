/**
 * Next.js Middleware
 *
 * Handles route protection based on authentication and authorization.
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Superadmin-only routes
    if (path.startsWith('/ops') || path.startsWith('/api/ops')) {
      if (!token?.isSuperadmin) {
        if (path.startsWith('/api/')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/hub', req.url));
      }
    }

    // Org-required routes - redirect to onboarding if no org
    const orgRequiredPaths = ['/coordinator', '/hub'];
    const needsOrg = orgRequiredPaths.some(p => path.startsWith(p));

    if (needsOrg && !token?.activeOrgId && !token?.isSuperadmin) {
      // Check if user has any orgs
      const hasOrgs = token?.organizations && token.organizations.length > 0;
      if (!hasOrgs) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }
      // Has orgs but none selected - redirect to org picker
      return NextResponse.redirect(new URL('/org-picker', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Public routes - no auth required
        const publicPaths = [
          '/',
          '/signin',
          '/book/demo',
          '/demo',
        ];

        // Public path prefixes
        const publicPrefixes = [
          '/book/',
          '/availability/',
          '/api/public/',
          '/api/auth/',
          '/_next/',
          '/favicon.ico',
        ];

        // Check exact public paths
        if (publicPaths.includes(path)) {
          return true;
        }

        // Check public prefixes
        for (const prefix of publicPrefixes) {
          if (path.startsWith(prefix)) {
            return true;
          }
        }

        // All other routes require authentication
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
