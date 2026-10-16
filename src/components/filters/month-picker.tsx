"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { monthLabel } from "@/lib/domain/dates";


/**
 * Sélecteur de mois : flèches précédent / suivant et liste déroulante.
 * `months` est trié du plus récent au plus ancien ; `allLabel` ajoute une option « toute la période » (valeur vide).
 */
export function MonthPicker({ months, value, param = "mois", allLabel, className }: {
  months: string[]; value: string | null; param?: string; allLabel?: string; className?: string;
}) {
  const router = useRouter();
  const go = (v: string | null) => {
    const q = new URLSearchParams(window.location.search);
    if (v) q.set(param, v); else q.delete(param);
    router.push(`${window.location.pathname}${q.size ? `?${q}` : ""}`);
  };
  const i = value ? months.indexOf(value) : -1;
  const older = i >= 0 ? months[i + 1] : months[0];
  const newer = i > 0 ? months[i - 1] : undefined;
  const arrow = "grid size-10 shrink-0 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle disabled:opacity-35 disabled:hover:bg-surface";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button type="button" className={arrow} disabled={!older} onClick={() => older && go(older)} aria-label="Mois précédent"><ChevronLeft className="size-4" /></button>
      <select value={value ?? ""} onChange={(e) => go(e.target.value || null)} aria-label="Mois"
        className="h-10 min-w-0 flex-1 rounded-md border border-line-2 bg-surface px-3 text-[15px] font-medium capitalize text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/12 sm:w-52 sm:flex-none">
        {allLabel && <option value="">{allLabel}</option>}
        {months.map((m) => <option key={m} value={m} className="capitalize">{monthLabel(m)}</option>)}
      </select>
      <button type="button" className={arrow} disabled={!newer} onClick={() => newer && go(newer)} aria-label="Mois suivant"><ChevronRight className="size-4" /></button>
    </div>
  );
}

/** Liste déroulante qui met à jour un paramètre de l'URL. */
export function ParamSelect({ param, value, options, label, className }: {
  param: string; value: string; options: { value: string; label: string }[]; label: string; className?: string;
}) {
  const router = useRouter();
  return (
    <select value={value} aria-label={label} onChange={(e) => {
      const q = new URLSearchParams(window.location.search);
      if (e.target.value) q.set(param, e.target.value); else q.delete(param);
      router.push(`${window.location.pathname}${q.size ? `?${q}` : ""}`);
    }} className={cn("h-10 rounded-md border border-line-2 bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/12", className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
