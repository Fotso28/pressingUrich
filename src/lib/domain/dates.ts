import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const TZ = "Africa/Douala";

/** F-DEP-05 : date de retrait prévue = dépôt + délai (standard ou express). */
export function computeDueAt(from: Date, opts: { isExpress: boolean; standardHours: number; expressHours: number }): Date {
  const hours = opts.isExpress ? opts.expressHours : opts.standardHours;
  return new Date(from.getTime() + hours * 3_600_000);
}

export function inTz(d: Date | string | number): TZDate {
  return new TZDate(new Date(d), TZ);
}

/** « 15/10/2026 14:30 » à l'heure de Douala. */
export function formatDateTime(d: Date | string | number): string {
  return format(inTz(d), "dd/MM/yyyy HH:mm");
}

export function formatDate(d: Date | string | number): string {
  return format(inTz(d), "dd/MM/yyyy");
}

/** Valeur pour un <input type="datetime-local"> à l'heure de Douala. */
export function toDateTimeLocal(d: Date): string {
  return format(inTz(d), "yyyy-MM-dd'T'HH:mm");
}

/** Lit la valeur d'un <input type="datetime-local"> comme une heure de Douala. */
export function fromDateTimeLocal(v: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return new Date(NaN);
  const [, y, mo, da, h, mi] = m.map(Number) as unknown as number[];
  return new Date(new TZDate(y, mo - 1, da, h, mi, 0, TZ).getTime());
}

/** Début du jour, de la semaine (lundi) et du mois à Douala, en instants UTC. */
export function periodStart(period: "day" | "week" | "month", now = new Date()): Date {
  const z = inTz(now);
  const y = z.getFullYear(), m = z.getMonth(), d = z.getDate();
  if (period === "month") return new Date(new TZDate(y, m, 1, 0, 0, 0, TZ).getTime());
  if (period === "week") {
    const dow = (z.getDay() + 6) % 7; // lundi = 0
    return new Date(new TZDate(y, m, d - dow, 0, 0, 0, TZ).getTime());
  }
  return new Date(new TZDate(y, m, d, 0, 0, 0, TZ).getTime());
}

const MONTH_NAMES = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** « 2026-09 » → « septembre 2026 ». */
export const monthLabel = (k: string) => `${MONTH_NAMES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
