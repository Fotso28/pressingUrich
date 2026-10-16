import { TZDate } from "@date-fns/tz";
import { TZ, inTz, monthLabel } from "./dates";

/** Filtre de période des listes : un jour, un mois, ou une période libre (du … au …, bornes incluses). */
export type PeriodMode = "jour" | "mois" | "perso";
export type PeriodParams = { periode?: string; jour?: string; mois?: string; du?: string; au?: string };
export type Period = { mode: PeriodMode; from: Date; to: Date; label: string; jour?: string; mois?: string; du?: string; au?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const startOf = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(new TZDate(y, m - 1, d, 0, 0, 0, TZ).getTime()); };
const nextDay = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(new TZDate(y, m - 1, d + 1, 0, 0, 0, TZ).getTime()); };
const fr = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;

/** « 2026-10-16 » du jour à Douala. */
export function dayKey(d: Date = new Date()): string {
  const z = inTz(d);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** Les N derniers mois (« 2026-10 », …), du plus récent au plus ancien. */
export function lastMonths(n = 24, now: Date = new Date()): string[] {
  const z = inTz(now);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(z.getFullYear(), z.getMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/**
 * Lit la période dans les paramètres d'URL. `fallback` : période par défaut sans paramètre (null = toutes dates).
 * Compatible avec les anciens liens `?du=…&au=…` et `?jour=…`.
 */
export function resolvePeriod(sp: PeriodParams, fallback: PeriodMode | null = null): Period | null {
  const mode = (["jour", "mois", "perso"].includes(sp.periode ?? "") ? sp.periode
    : sp.periode === "tout" ? null
    : sp.du || sp.au ? "perso" : sp.mois ? "mois" : sp.jour ? "jour" : fallback) as PeriodMode | null;
  if (mode === "jour") {
    const k = sp.jour && DAY.test(sp.jour) ? sp.jour : dayKey();
    return { mode, from: startOf(k), to: nextDay(k), jour: k, label: k === dayKey() ? "Aujourd'hui" : fr(k) };
  }
  if (mode === "mois") {
    const k = sp.mois && MONTH.test(sp.mois) ? sp.mois : dayKey().slice(0, 7);
    const [y, m] = k.split("-").map(Number);
    return { mode, from: new Date(new TZDate(y, m - 1, 1, 0, 0, 0, TZ).getTime()), to: new Date(new TZDate(y, m, 1, 0, 0, 0, TZ).getTime()), mois: k, label: monthLabel(k) };
  }
  if (mode === "perso") {
    let du = sp.du && DAY.test(sp.du) ? sp.du : null, au = sp.au && DAY.test(sp.au) ? sp.au : null;
    if (!du && !au) du = au = dayKey();
    if (du && au && du > au) [du, au] = [au, du];
    const from = du ? startOf(du) : new Date(0);
    const to = au ? nextDay(au) : nextDay(dayKey());
    const label = du && au ? (du === au ? fr(du) : `du ${fr(du)} au ${fr(au)}`) : du ? `depuis le ${fr(du)}` : `jusqu'au ${fr(au!)}`;
    return { mode, from, to, du: du ?? undefined, au: au ?? undefined, label };
  }
  return null;
}
