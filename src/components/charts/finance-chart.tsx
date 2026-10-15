"use client";

import { useEffect, useRef, useState } from "react";
import { formatAmount } from "@/lib/domain/money";

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
// Palette validée (dataviz) : 3 séries, une seule échelle en FCFA.
export const FIN_COLORS = { sales: "#4a63c6", expenses: "#eb6834", profit: "#1baf7a" };

export type FinancePoint = { month: string; sales: number; expenses: number; profit: number };

const label = (m: string, long = false) => {
  const [y, mo] = m.split("-");
  return long ? `${MONTHS[Number(mo) - 1]} ${y}` : `${MONTHS[Number(mo) - 1]}${Number(mo) === 1 ? ` ${y.slice(2)}` : ""}`;
};
const k = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(".", ",")} M` : `${Math.round(v / 1000)} k`);

/** Ventes et dépenses en barres groupées, bénéfice en ligne ; info-bulle par mois. */
export function FinanceChart({ data, height = 260 }: { data: FinancePoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const padL = 46, padR = 8, padT = 12, padB = 26;
  const H = height, innerH = H - padT - padB, innerW = w - padL - padR;
  const maxV = Math.max(1, ...data.flatMap((d) => [d.sales, d.expenses, d.profit]));
  const minV = Math.min(0, ...data.map((d) => d.profit));
  const step = maxV > 800_000 ? 200_000 : 100_000;
  const top = Math.ceil(maxV / step) * step;
  const bottom = Math.floor(minV / step) * step;
  const y = (v: number) => padT + ((top - v) / (top - bottom)) * innerH;
  const ticks: number[] = [];
  for (let t = bottom; t <= top; t += step) ticks.push(t);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(22, (band - 10) / 2));
  const cx = (i: number) => padL + band * i + band / 2;
  const line = data.map((d, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(d.profit).toFixed(1)}`).join(" ");
  const showEvery = band < 34 ? 2 : 1;
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-2">
        <Legend color={FIN_COLORS.sales} label="Ventes encaissées" />
        <Legend color={FIN_COLORS.expenses} label="Dépenses" />
        <Legend color={FIN_COLORS.profit} label="Bénéfice" line />
      </div>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Ventes, dépenses et bénéfice par mois" className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#c9ceda" : "#eceef3"} />
              <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11.5" fill="#6b7486" className="tnum">{t === 0 ? "0" : k(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = cx(i) - barW - 1;
            const r = (v: number, x: number, color: string) => {
              const y0 = y(Math.max(0, v)), hh = Math.max(v > 0 ? 1 : 0, Math.abs(y(v) - y(0)));
              return <path d={`M${x},${y0 + hh} V${y0 + Math.min(4, hh)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${y0 + hh} Z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />;
            };
            return (
              <g key={d.month}>
                {hover === i && <rect x={cx(i) - band / 2 + 2} y={padT} width={band - 4} height={innerH} rx={6} fill="#f1f3f7" />}
                {r(d.sales, x0, FIN_COLORS.sales)}
                {r(d.expenses, x0 + barW + 2, FIN_COLORS.expenses)}
                {i % showEvery === 0 && <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11.5" fill="#6b7486">{label(d.month)}</text>}
              </g>
            );
          })}
          <path d={line} fill="none" stroke={FIN_COLORS.profit} strokeWidth={2} strokeLinejoin="round" />
          {data.map((d, i) => (
            <circle key={d.month} cx={cx(i)} cy={y(d.profit)} r={hover === i ? 5 : 3.5} fill={FIN_COLORS.profit} stroke="#fff" strokeWidth={2} />
          ))}
          {data.length > 0 && (
            <text x={cx(data.length - 1) - barW - 6} y={y(data[data.length - 1].profit) + 4} fontSize="11.5" fontWeight={600} fill="#0e1726" textAnchor="end"
              stroke="#fff" strokeWidth={4} paintOrder="stroke" className="tnum">
              {k(data[data.length - 1].profit)}
            </text>
          )}
          {data.map((d, i) => (
            <rect key={d.month} x={cx(i) - band / 2} y={padT} width={band} height={innerH + padB} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        {h && hover !== null && (
          <div className="pointer-events-none absolute z-10 w-52 rounded-lg bg-ink px-3 py-2.5 text-[12.5px] text-white shadow-pop"
            style={{ left: Math.min(Math.max(0, cx(hover) - 104), w - 208), top: 0 }}>
            <p className="mb-1.5 font-semibold capitalize">{label(h.month, true)}</p>
            <Tip color={FIN_COLORS.sales} label="Ventes" value={h.sales} />
            <Tip color={FIN_COLORS.expenses} label="Dépenses" value={h.expenses} />
            <div className="mt-1 border-t border-white/15 pt-1"><Tip color={FIN_COLORS.profit} label="Bénéfice" value={h.profit} strong /></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      {line ? <span className="relative h-0.5 w-4 rounded" style={{ background: color }}><span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: color }} /></span>
        : <span className="size-2.5 rounded-[3px]" style={{ background: color }} />}
      {label}
    </span>
  );
}

function Tip({ color, label, value, strong }: { color: string; label: string; value: number; strong?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-white/75"><span className="size-2 rounded-full" style={{ background: color }} />{label}</span>
      <span className={`tnum ${strong ? "font-semibold" : ""}`}>{formatAmount(value)}</span>
    </p>
  );
}
