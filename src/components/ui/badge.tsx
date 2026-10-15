import * as React from "react";
import { cn } from "@/lib/cn";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, computePaymentStatus, type OrderStatus } from "@/lib/domain/status";

const STATUS_STYLE: Record<OrderStatus, string> = {
  DEPOSEE: "bg-[#eef0f4] text-[#4a5468] ring-[#d9dde6]",
  EN_TRAITEMENT: "bg-brand-50 text-brand ring-brand-100",
  PRETE: "bg-success-50 text-[#12813c] ring-[#c9f0d7]",
  RETIREE: "bg-[#e9ebef] text-[#5b6476] ring-[#d6dae2] line-through decoration-[#5b6476]/40",
  ANNULEE: "bg-danger-50 text-[#c42020] ring-[#fbd5d5]",
};
const DOT: Record<OrderStatus, string> = {
  DEPOSEE: "bg-[#8a93a5]", EN_TRAITEMENT: "bg-brand", PRETE: "bg-success", RETIREE: "bg-[#8a93a5]", ANNULEE: "bg-danger",
};

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium ring-1 ring-inset", className)} {...props} />;
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge className={cn(STATUS_STYLE[status], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[status])} aria-hidden />
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentBadge({ paid, total }: { paid: number; total: number }) {
  const s = computePaymentStatus(paid, total);
  const cls = s === "SOLDE" ? "bg-success-50 text-[#12813c] ring-[#c9f0d7]" : s === "ACOMPTE" ? "bg-warning-50 text-[#b56a00] ring-[#fde3b8]" : "bg-[#eef0f4] text-ink-2 ring-[#d9dde6]";
  return <Badge className={cls}>{PAYMENT_STATUS_LABEL[s]}</Badge>;
}

export function FlagDot({ kind }: { kind: "late" | "abandoned" }) {
  return kind === "late" ? (
    <Badge className="bg-danger-50 text-danger ring-[#fbd5d5]"><span className="size-1.5 rounded-full bg-danger" />En retard</Badge>
  ) : (
    <Badge className="bg-warning-50 text-[#b56a00] ring-[#fde3b8]"><span className="size-1.5 rounded-full bg-warning" />En souffrance</Badge>
  );
}
