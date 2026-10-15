"use client";

import { useEffect, useState } from "react";

/** Événements online/offline + ping périodique de /api/health (TRD §6). */
export function useOnlineStatus(intervalMs = 20000) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let alive = true;
    const ping = async () => {
      if (!navigator.onLine) { if (alive) setOnline(false); return; }
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch("/api/health", { method: "HEAD", cache: "no-store", signal: ctrl.signal });
        clearTimeout(t);
        if (alive) setOnline(r.ok);
      } catch { if (alive) setOnline(false); }
    };
    const on = () => { setOnline(true); ping(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const id = setInterval(ping, intervalMs);
    ping();
    return () => { alive = false; clearInterval(id); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [intervalMs]);
  return online;
}
