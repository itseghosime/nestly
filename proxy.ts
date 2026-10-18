import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isStaffRoute = request.nextUrl.pathname.startsWith('/staff');
  const isAuthRoute =
    request.nextUrl.pathname.startsWith('/staff/signin') ||
    request.nextUrl.pathname.startsWith('/staff/forgot-password') ||
    request.nextUrl.pathname.startsWith('/staff/reset-password') ||
    request.nextUrl.pathname.startsWith('/staff/accept-invitation') ||
    request.nextUrl.pathname.startsWith('/staff/session-expired');

  if (isStaffRoute && !isAuthRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/staff/signin';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/staff/:path*'],
};
