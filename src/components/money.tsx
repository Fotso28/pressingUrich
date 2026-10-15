import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/domain/money";

export function Money({ value, className, unit = true, strong }: { value: number; className?: string; unit?: boolean; strong?: boolean }) {
  return (
    <span className={cn("tnum whitespace-nowrap", strong && "font-semibold", className)}>
      {formatAmount(value)}
      {unit && <span className="ml-1 text-[0.78em] font-medium text-ink-3">FCFA</span>}
    </span>
  );
}
