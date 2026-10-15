"use client";

import { cn } from "@/lib/cn";
import { METHOD_LABEL, METHODS, type Method } from "@/lib/domain/cash";

export function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode de paiement">
      {METHODS.map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}
          className={cn("flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition",
            value === m ? "border-brand bg-brand-50 text-brand ring-3 ring-brand/10" : "border-line-2 bg-surface text-ink-2 hover:bg-subtle")}>
          <span className={cn("size-2 rounded-full", m === "ESPECES" ? "bg-[#4a5468]" : m === "MTN_MOMO" ? "bg-[#f2c200]" : "bg-[#ff7900]")} />
          {METHOD_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
