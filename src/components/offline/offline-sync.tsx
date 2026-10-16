"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { syncNow } from "@/lib/offline/store";

/**
 * Dans l'application en ligne : garde à jour la copie locale du mode hors ligne (au chargement,
 * toutes les 5 minutes et au retour du réseau) et envoie les opérations restées en attente.
 */
export function OfflineSync() {
  useEffect(() => {
    const run = async () => {
      const r = await syncNow();
      if (r.ok) toast.success(`${r.ok} opération(s) faite(s) hors ligne synchronisée(s).`);
      if (r.failed) toast.error(`${r.failed} opération(s) hors ligne refusée(s) : ${r.errors.join(" · ")}`, { duration: Infinity, closeButton: true });
    };
    void run();
    const id = setInterval(run, 5 * 60_000);
    window.addEventListener("online", run);
    return () => { clearInterval(id); window.removeEventListener("online", run); };
  }, []);
  return null;
}
