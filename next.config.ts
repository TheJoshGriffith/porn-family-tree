import type { NextConfig } from "next";
import os from "node:os";

// The dev server blocks its JS/HMR for any origin but localhost, so a phone
// opening http://<this-mac's-ip>:3000 gets HTML with no interactivity. Allow
// this machine's own LAN addresses (read at startup, so DHCP changes are fine).
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

// Production only: the dev server needs eval and websockets these would block.
// 'unsafe-inline' scripts cover the theme bootstrap in layout.tsx and Next's
// inline hydration data; images are hotlinked from StashDB's CDN.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone", // self-contained server for the Docker image
  poweredByHeader: false,
  allowedDevOrigins: lanAddresses,
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
