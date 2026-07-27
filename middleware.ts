import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, tokenIsValid } from "./lib/auth";

// Public pages are intentionally separate from every operator API and screen.
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

function isPublicPage(pathname: string): boolean {
  return pathname === "/public" || pathname.startsWith("/public/");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || isPublicPage(pathname)) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (await tokenIsValid(token)) return NextResponse.next();

  // The default unauthenticated destination is the read-only public site.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/public";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Every operator API stays behind the password gate.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized — password required." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
