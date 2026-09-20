import { NextResponse, type NextRequest } from 'next/server';

/// Content-Security-Policy with a per-request nonce.
///
/// The app has no HTML sinks today — every user string is a React text node —
/// so this is the backstop for the first one someone adds, not a fix for a live
/// hole. A nonce rather than a hash because the theme script in app/layout.tsx
/// is the only inline script and it never changes per page; hashing it would
/// just mean updating the hash every time someone touches it.
///
/// `script-src` is the directive that stops injected JavaScript and it is kept
/// strict. `style-src` allows inline because framer-motion and the progress
/// bars write `style=` attributes; a nonce cannot cover attributes.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV !== 'production';
  const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' lets the nonced Next bootstrap load its own chunks
    // without listing every chunk; 'unsafe-eval' is for dev-only source maps.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    // ws: is the dev-server HMR socket.
    `connect-src 'self' ${apiOrigin}${isDev ? ' ws: wss:' : ''}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];
  const csp = directives.join('; ');

  // Next reads the nonce back off the request header to tag its own inline
  // scripts; the layout reads x-nonce for the theme script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  // Browsers ignore HSTS over plain http, and a local https experiment should
  // not pin the whole machine to https for a year — production only.
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }

  return response;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export const config = {
  matcher: [
    // Static assets carry no HTML, so a policy on them is wasted work.
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
