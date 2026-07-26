/** @type {import('next').NextConfig} */
const nextConfig = {
  // Agent runtime shells out to the selected CLI (Codex or Claude) via child_process, and the
  // JSON data store uses fs — both require the Node.js runtime (the default
  // for route handlers). We keep server-only code out of client bundles.
  reactStrictMode: true,
  experimental: {
    // Allow importing files (persona JSON, etc.) from outside the app dir.
  },
};

export default nextConfig;
