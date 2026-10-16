"use client";

import { get, set, del } from "idb-keyval";
import type { OfflineOp, OpResult, Snapshot } from "./types";
import { OP_LABEL } from "./types";
import { applyOp } from "./ops";

/**
 * Mémoire locale du mode hors ligne (IndexedDB) : la dernière copie reçue du serveur, modifiée
 * au fil des opérations faites sans réseau, et la file d'opérations à rejouer au retour du réseau.
 */
export type OfflineState = Snapshot & {
  savedAt: string;
  queue: OfflineOp[];
  failed: { op: OfflineOp; error: string; at: string }[];
};

const KEY = "cp-offline-v1";
type Listener = (s: OfflineState | null) => void;
const listeners = new Set<Listener>();

export async function loadState(): Promise<OfflineState | null> {
  try { return (await get<OfflineState>(KEY)) ?? null; } catch { return null; }
}

async function save(s: OfflineState | null) {
  if (s) await set(KEY, s); else await del(KEY);
  listeners.forEach((l) => l(s));
}

export function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }

// Les modifications locales sont sérialisées pour ne jamais perdre une opération.
let chain: Promise<unknown> = Promise.resolve();
export function mutate(fn: (s: OfflineState) => OfflineState | void): Promise<OfflineState> {
  const p = chain.then(async () => {
    const s = await loadState();
    if (!s) throw new Error("Mode hors ligne non initialisé.");
    const draft = structuredClone(s);
    const next = fn(draft) ?? draft;
    await save(next);
    return next;
  });
  chain = p.catch(() => undefined);
  return p;
}

export const isExpired = (s: OfflineState) => new Date(s.expiresAt).getTime() < Date.now();

let syncing: Promise<SyncReport> | null = null;
export type SyncReport = { sent: number; ok: number; failed: number; offline?: boolean; unauthorized?: boolean; errors: string[] };

/**
 * Rejoue la file puis rafraîchit la copie locale. Sans réseau ou sans session, ne fait rien et garde la file.
 * Une opération refusée par le serveur est retirée de la file et gardée dans `failed` pour que l'agent la voie.
 */
export function syncNow(): Promise<SyncReport> {
  syncing ??= (async (): Promise<SyncReport> => {
    const report: SyncReport = { sent: 0, ok: 0, failed: 0, errors: [] };
    try {
      const current = await loadState();
      const queue = current?.queue ?? [];
      if (queue.length) {
        report.sent = queue.length;
        const res = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: queue }), credentials: "same-origin" });
        if (res.status === 401) return { ...report, unauthorized: true };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { results } = (await res.json()) as { results: OpResult[] };
        const byId = new Map(results.map((r) => [r.opId, r]));
        await mutate((s) => {
          const done = new Set(results.map((r) => r.opId));
          for (const op of s.queue) {
            const r = byId.get(op.opId);
            if (r && !r.ok) {
              s.failed.unshift({ op, error: r.error ?? "Refusé", at: new Date().toISOString() });
              report.errors.push(`${OP_LABEL[op.type]} : ${r.error ?? "refusé"}`);
            }
          }
          s.queue = s.queue.filter((op) => !done.has(op.opId));
          s.failed = s.failed.slice(0, 50);
        });
        report.ok = results.filter((r) => r.ok).length;
        report.failed = results.length - report.ok;
      }
      const snap = await fetch("/api/offline/snapshot", { credentials: "same-origin", cache: "no-store" });
      if (snap.status === 401) return { ...report, unauthorized: true };
      if (!snap.ok) throw new Error(`HTTP ${snap.status}`);
      const data = (await snap.json()) as Snapshot;
      // Remplacement sérialisé avec les autres modifications locales.
      const replace = chain.then(async () => {
        const prev = await loadState();
        // Un autre compte sur cet appareil : on repart de zéro.
        const keep = !!prev && prev.user.id === data.user.id;
        const next: OfflineState = { ...data, savedAt: new Date().toISOString(), queue: keep ? prev.queue : [], failed: keep ? prev.failed : [] };
        // Opérations ajoutées pendant la synchronisation : on les réapplique sur la copie fraîche.
        for (const op of next.queue) applyOp(next, op);
        await save(next);
      });
      chain = replace.catch(() => undefined);
      await replace;
      return report;
    } catch {
      return { ...report, offline: true };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export async function clearState() { await save(null); }

/** Enregistre une opération faite au comptoir : effet local immédiat, envoi au serveur dès que possible. */
export async function perform(op: OfflineOp): Promise<OfflineState> {
  const s = await mutate((st) => { applyOp(st, op); st.queue.push(op); });
  if (typeof navigator !== "undefined" && navigator.onLine) void syncNow();
  return s;
}
