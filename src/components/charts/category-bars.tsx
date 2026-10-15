import { formatAmount } from "@/lib/domain/money";

/** Classement des dépenses par catégorie : une seule teinte, valeur et part affichées. */
export function CategoryBars({ data }: { data: { label: string; total: number; hint?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  const sum = data.reduce((s, d) => s + d.total, 0);
  return (
    <ul className="space-y-3.5">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="font-medium text-ink">{d.label}{d.hint && <span className="ml-1.5 text-[12.5px] font-normal text-ink-3">{d.hint}</span>}</span>
            <span className="tnum text-ink-2"><span className="font-semibold text-ink">{formatAmount(d.total)}</span> <span className="text-[12.5px] text-ink-3">· {Math.round((d.total / Math.max(1, sum)) * 100)} %</span></span>
          </div>
          <div className="h-2.5 rounded-full bg-subtle">
            <div className="h-full rounded-full" style={{ width: `${Math.max(1.5, (d.total / max) * 100)}%`, background: "#eb6834" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
