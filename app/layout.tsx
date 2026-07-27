import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import LogoutButton from "./logout-button";
import { AUTH_COOKIE, tokenIsValid } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Bridges NYC",
  description:
    "Multi-agent AI simulation of Reflective Structured Dialogue between synthetic Muslim and Jewish personas.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const authenticated = await tokenIsValid(jar.get(AUTH_COOKIE)?.value);

  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href={authenticated ? "/" : "/public"} className="brand">
              <span className="brand-mark">◆◆</span> Digital Bridges NYC
            </Link>
            <nav className="nav" aria-label="Primary navigation">
              {authenticated ? (
                <>
                  <Link href="/">Projects</Link>
                  <Link href="/jobs">Jobs</Link>
                  <Link href="/personas">Personas</Link>
                  <Link href="/content">Content Review</Link>
                  <Link href="/showcase">Showcase</Link>
                  <Link href="/public">Public site</Link>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Link href="/public">Published projects</Link>
                  <Link href="/login" className="button-link small">Administrator login</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main id="main-content" className="container">{children}</main>
        <footer className="footer">
          A peacebuilding research simulation. All personas are fictional and all
          generated content is clearly labeled AI-generated.
        </footer>
      </body>
    </html>
  );
}
