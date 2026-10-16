import { OfflineApp } from "@/components/offline/offline-app";

export const metadata = { title: "Mode hors ligne" };

/**
 * Page statique mise en cache par le service worker : elle s'ouvre sans réseau et travaille
 * uniquement sur la copie locale (IndexedDB). Aucune donnée n'est rendue côté serveur ici.
 */
export default function OfflinePage() {
  return <OfflineApp />;
}
