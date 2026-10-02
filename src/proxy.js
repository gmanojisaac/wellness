import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Each signed-in area and the page signed-out visitors are sent to.
const AREAS = [
  { prefix: '/admin', login: '/admin/login' },
  { prefix: '/student', login: '/student/login' },
];

// Refreshes the Supabase session for the admin panel and student portal and redirects
// signed-out visitors to the right login page. What a signed-in user may see is
// enforced in the database (RLS and the admin_*/student_* functions).
export async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers || {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // getClaims() validates the JWT; don't run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;
  const area = AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));

  if (!isSignedIn && area && pathname !== area.login) {
    const loginUrl = new URL(area.login, request.url);
    loginUrl.searchParams.set('next', pathname + search);
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/student', '/student/:path*', '/api/student/:path*'],
};
