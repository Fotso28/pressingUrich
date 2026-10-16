"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthLabel } from "@/lib/domain/dates";
import type { PeriodMode } from "@/lib/domain/period";

const field = "h-10 rounded-md border border-line-2 bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/12";
const arrow = "grid size-10 shrink-0 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle disabled:opacity-35";

/**
 * Filtre de période : un jour (flèches jour précédent / suivant), un mois, ou une période libre.
 * Écrit `periode`, `jour`, `mois`, `du`, `au` dans l'URL et remet la pagination à zéro.
 */
export function PeriodFilter({ mode, jour, mois, du, au, months, today, allowAll = true, className }: {
  mode: PeriodMode | null; jour?: string; mois?: string; du?: string; au?: string;
  /** Mois proposés, du plus récent au plus ancien. */
  months: string[]; today: string; allowAll?: boolean; className?: string;
}) {
  const router = useRouter();
  const [d1, setD1] = useState(du ?? "");
  const [d2, setD2] = useState(au ?? "");
  function go(patch: Record<string, string | null>) {
    const q = new URLSearchParams(window.location.search);
    for (const k of ["periode", "jour", "mois", "du", "au", "page"]) q.delete(k);
    for (const [k, v] of Object.entries(patch)) if (v) q.set(k, v);
    router.push(`${window.location.pathname}${q.size ? `?${q}` : ""}`);
  }
  const shift = (k: string, n: number) => {
    const [y, m, d] = k.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d + n));
    return x.toISOString().slice(0, 10);
  };
  const mi = mois ? months.indexOf(mois) : -1;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <select value={mode ?? "tout"} aria-label="Période" className={cn(field, "font-medium")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "jour") go({ periode: "jour", jour: today });
          else if (v === "mois") go({ periode: "mois", mois: months[0] });
          else if (v === "perso") go({ periode: "perso", du: today, au: today });
          else go({ periode: "tout" });
        }}>
        {allowAll && <option value="tout">Toutes les dates</option>}
        <option value="jour">Un jour</option>
        <option value="mois">Un mois</option>
        <option value="perso">Période personnalisée</option>
      </select>
      {mode === "jour" && jour && (
        <div className="flex items-center gap-2">
          <button type="button" className={arrow} onClick={() => go({ periode: "jour", jour: shift(jour, -1) })} aria-label="Jour précédent"><ChevronLeft className="size-4" /></button>
          <input type="date" value={jour} max={today} aria-label="Jour" className={cn(field, "tnum")} onChange={(e) => e.target.value && go({ periode: "jour", jour: e.target.value })} />
          <button type="button" className={arrow} disabled={jour >= today} onClick={() => go({ periode: "jour", jour: shift(jour, 1) })} aria-label="Jour suivant"><ChevronRight className="size-4" /></button>
          {jour !== today && <button type="button" onClick={() => go({ periode: "jour", jour: today })} className="text-sm font-medium text-brand">Aujourd&apos;hui</button>}
        </div>
      )}
      {mode === "mois" && (
        <div className="flex items-center gap-2">
          <button type="button" className={arrow} disabled={mi < 0 || mi >= months.length - 1} onClick={() => go({ periode: "mois", mois: months[mi + 1] })} aria-label="Mois précédent"><ChevronLeft className="size-4" /></button>
          <select value={mois} aria-label="Mois" className={cn(field, "capitalize")} onChange={(e) => go({ periode: "mois", mois: e.target.value })}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button type="button" className={arrow} disabled={mi <= 0} onClick={() => go({ periode: "mois", mois: months[mi - 1] })} aria-label="Mois suivant"><ChevronRight className="size-4" /></button>
        </div>
      )}
      {mode === "perso" && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); go({ periode: "perso", du: d1 || null, au: d2 || null }); }}>
          <label className="flex items-center gap-2 text-sm text-ink-3">Du<input type="date" value={d1} max={d2 || today} onChange={(e) => setD1(e.target.value)} className={cn(field, "tnum")} /></label>
          <label className="flex items-center gap-2 text-sm text-ink-3">au<input type="date" value={d2} min={d1 || undefined} max={today} onChange={(e) => setD2(e.target.value)} className={cn(field, "tnum")} /></label>
          <button type="submit" className="h-10 rounded-md border border-line-2 bg-surface px-3.5 text-sm font-medium hover:bg-subtle">Appliquer</button>
        </form>
      )}
    </div>
  );
}
