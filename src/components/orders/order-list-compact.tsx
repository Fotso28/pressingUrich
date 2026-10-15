import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import type { OrderStatus } from "@/lib/domain/status";

export interface CompactOrder {
  id: string; number: number; status: OrderStatus; total: number; amountPaid: number; dueAt: Date; createdAt: Date; readyAt: Date | null; customerName?: string;
}

export function OrderListCompact({ orders, show = "due" }: { orders: CompactOrder[]; show?: "due" | "created" | "ready" | "remaining" }) {
  return (
    <ul className="divide-y divide-line">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/commandes/${o.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-canvas">
            <span className="w-16 shrink-0 font-semibold tnum text-ink">{formatOrderNumber(o.number)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium">{o.customerName ?? <>Reste <Money value={Math.max(0, o.total - o.amountPaid)} /></>}</p>
              <p className="text-[13px] text-ink-3 tnum">
                {show === "created" && `Déposée ${formatDateTime(o.createdAt)}`}
                {show === "due" && `Prévue le ${formatDate(o.dueAt)}`}
                {show === "ready" && o.readyAt && `Prête depuis le ${formatDate(o.readyAt)}`}
                {show === "remaining" && <>Reste <Money value={o.total - o.amountPaid} /></>}
              </p>
            </div>
            <span className="hidden sm:block"><Money value={o.total} className="text-sm text-ink-2" /></span>
            <StatusBadge status={o.status} />
            <ChevronRight className="size-4 text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
