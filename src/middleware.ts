import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
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

  // ログイン・登録ページ・登録APIへのアクセスは許可
  if (request.nextUrl.pathname === "/register" || request.nextUrl.pathname === "/api/register") {
    return supabaseResponse;
  }

  // 外部システム向けエンドポイントは認証不要（LINE WORKSのコールバック / 日次Cron）。
  // 未ログインでも到達させる（callback側は X-WORKS-Signature、notify側は CRON_SECRET で保護）。
  if (
    request.nextUrl.pathname.startsWith("/api/lineworks/callback") ||
    request.nextUrl.pathname.startsWith("/api/lineworks/notify")
  ) {
    return supabaseResponse;
  }

  if (request.nextUrl.pathname === "/login") {
    if (user) {
      // ログイン済みならダッシュボードへリダイレクト
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // 未ログインならログインページへリダイレクト
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|txt|xml)$).*)",
  ],
};
