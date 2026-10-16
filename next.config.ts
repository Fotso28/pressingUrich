import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Version de la page hors ligne mise en cache (change à chaque déploiement).
const revision = process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now());

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Page de secours ouverte sans réseau, et le logo qu'elle affiche.
  additionalPrecacheEntries: [{ url: "/hors-ligne", revision }, { url: "/logo.png", revision }],
  disable: process.env.NODE_ENV === "development",
});

const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" }, // l'impression utilise une iframe de même origine
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  serverExternalPackages: ["pg", "ws", "@neondatabase/serverless", "bufferutil", "utf-8-validate"],
};

export default withSerwist(nextConfig);
