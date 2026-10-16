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

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "ws", "@neondatabase/serverless", "bufferutil", "utf-8-validate"],
};

export default withSerwist(nextConfig);
