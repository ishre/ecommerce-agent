import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get("auth_token");
  const isLoginPage = request.nextUrl.pathname === "/login";
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");

  // Allow API routes (they handle their own auth if needed)
  // But protect login/logout API routes
  if (isApiRoute) {
    if (request.nextUrl.pathname === "/api/login" || request.nextUrl.pathname === "/api/logout") {
      return NextResponse.next();
    }
    // For other API routes, you might want to check auth, but for now we'll allow them
    return NextResponse.next();
  }

  // If user is not authenticated and trying to access protected page
  if (!authToken && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If user is authenticated and trying to access login page, redirect to home
  if (authToken && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

