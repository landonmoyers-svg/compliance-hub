import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This scaffold lives inside the Compliance Hub repo, which has its own
  // lockfile. Pin the workspace root so Turbopack builds only HomeVault.
  turbopack: { root: import.meta.dirname },
  async headers() {
    return [
      {
        // Zero-knowledge app: tight baseline security headers everywhere.
        // A full CSP (script-src 'self', connect-src the Supabase project only,
        // no unsafe-inline) is a Phase-2 exit-bar item — see docs/SECURITY.md.
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
