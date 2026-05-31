import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    if (!token) return;

    const isPartner = token.role === "PARTNER";
    const profileComplete = token.profileComplete as boolean | undefined;
    const pathname = req.nextUrl.pathname;

    // PARTNER で未完了 → /settings?setup=1 に強制リダイレクト
    if (isPartner && !profileComplete && pathname !== "/settings") {
      return NextResponse.redirect(new URL("/settings?setup=1", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard",
    "/projects/:path*",
    "/calendar",
    "/billing",
    "/replacement-models",
    "/estimate",
    "/messages",
    "/users",
    "/help",
    "/settings",
  ],
};
