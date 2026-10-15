/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

// TRD §6 : seul le shell (JS, CSS, polices, icônes) est mis en cache ;
// les pages et les données métier passent toujours par le réseau.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({ cacheName: "static", plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 })] }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest"),
      handler: new StaleWhileRevalidate({ cacheName: "assets" }),
    },
    { matcher: () => true, handler: new NetworkOnly() },
  ],
});

serwist.addEventListeners();
