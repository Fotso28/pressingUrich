"use client";

import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Appelle une Server Action : bouton désactivé pendant l'envoi, toast de succès (3 s)
 * ou d'erreur (persistant), jamais d'erreur silencieuse.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const exec = useCallback(async <T,>(fn: () => Promise<Result<T>>, opts?: { success?: string; onSuccess?: (d: T) => void }) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) {
        if (opts?.success) toast.success(opts.success, { duration: 3000 });
        startTransition(() => opts?.onSuccess?.(r.data));
        return r;
      }
      toast.error(r.error, { duration: Infinity, closeButton: true });
      return r;
    } catch {
      toast.error("Connexion impossible avec le serveur. Vérifiez Internet et réessayez.", { duration: Infinity, closeButton: true });
      return { ok: false, error: "network" } as Result<T>;
    } finally {
      setBusy(false);
    }
  }, []);
  return { exec, pending: pending || busy };
}
