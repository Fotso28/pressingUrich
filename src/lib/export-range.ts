import { TZDate } from "@date-fns/tz";
import { TZ } from "@/lib/domain/dates";

/** `?mois=2026-09` → bornes du mois (fuseau de Douala) et suffixe de fichier ; sans paramètre : tout l'historique. */
export function exportRange(req: Request): { from: Date | null; to: Date | null; suffix: string } {
  const mois = new URL(req.url).searchParams.get("mois");
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) return { from: null, to: null, suffix: new Date().toISOString().slice(0, 10) };
  const [y, m] = mois.split("-").map(Number);
  return { from: new Date(new TZDate(y, m - 1, 1, 0, 0, 0, TZ).getTime()), to: new Date(new TZDate(y, m, 1, 0, 0, 0, TZ).getTime()), suffix: mois };
}
