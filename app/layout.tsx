import type { Metadata } from "next";
import Link from "next/link";
import LogoutButton from "./logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Bridges NYC",
  description:
    "Multi-agent AI simulation of Reflective Structured Dialogue between synthetic Muslim and Jewish personas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">◆◆</span> Digital Bridges NYC
            </Link>
            <nav className="nav">
              <Link href="/">Projects</Link>
              <Link href="/jobs">Jobs</Link>
              <Link href="/personas">Personas</Link>
              <Link href="/content">Content Review</Link>
              <Link href="/showcase">Showcase</Link>
              <LogoutButton />
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          A peacebuilding research simulation. All personas are fictional and all
          generated content is clearly labeled AI-generated.
        </footer>
      </body>
    </html>
  );
}
