import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { pageUser } from "@/server/session";
import { getOrder } from "@/server/queries/orders";
import { getSettings } from "@/server/queries/settings";
import { getOpenCashSession } from "@/server/queries/cash";
import { Card, CardHeader } from "@/components/ui/card";
import { FlagDot, PaymentBadge, StatusBadge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatDateTime } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/normalize";
import { METHOD_LABEL } from "@/lib/domain/cash";
import { ORDER_STATUS_LABEL, isAbandoned, isLate } from "@/lib/domain/status";
import { OrderActions, VoidPaymentButton } from "./order-actions";
import { cn } from "@/lib/cn";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { title: "Commande" };
  const [o] = await db.select({ number: orders.number }).from(orders).where(eq(orders.id, id)).limit(1);
  return { title: o ? `Commande n° ${formatOrderNumber(o.number)}` : "Commande" };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o, settings, session] = await Promise.all([getOrder(id), getSettings(), getOpenCashSession(user.id)]);
  if (!o) notFound();
  const { order } = o;
  const remaining = order.total - order.amountPaid;
  const late = isLate(order);
  const abandoned = isAbandoned(order, settings.abandonedAfterDays);
  const isAdmin = user.role === "ADMIN";

  return (
    <div className="pb-28 lg:pb-0">
      <Link href="/commandes" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />Commandes</Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] tnum">N° {formatOrderNumber(order.number)}</h1>
            <StatusBadge status={order.status} />
            <PaymentBadge paid={order.amountPaid} total={order.total} />
            {order.isExpress && <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning-50 px-2.5 text-[12.5px] font-medium text-[#b56a00] ring-1 ring-inset ring-[#fde3b8]"><Zap className="size-3" />Express</span>}
            {late && <FlagDot kind="late" />}
            {abandoned && <FlagDot kind="abandoned" />}
          </div>
          <p className="mt-2 text-[15px] text-ink-2">
            <Link href={`/clients/${o.customer.id}`} className="font-semibold text-ink hover:text-brand">{o.customer.fullName}</Link>
            <span className="text-ink-3 tnum"> · {formatPhone(o.customer.phone)}</span>
          </p>
          <p className="mt-1 text-sm text-ink-3 tnum">Déposée le {formatDateTime(order.createdAt)} par {o.createdByName ?? "—"} · prévue le <span className={cn(late && "font-medium text-danger")}>{formatDateTime(order.dueAt)}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Articles" description={`${o.items.reduce((s, i) => s + i.quantity, 0)} pièce(s)`} />
            <ul className="divide-y divide-line border-t border-line">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-start gap-4 px-5 py-3.5">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-subtle text-[13px] font-semibold tnum text-ink-2">{i.quantity}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.itemLabel} <span className="font-normal text-ink-3">· {i.serviceLabel}</span></p>
                    {(i.color || i.brand) && <p className="text-[13px] text-ink-3">{[i.color, i.brand].filter(Boolean).join(" · ")}</p>}
                    {i.observations && <p className="mt-1 inline-block rounded bg-warning-50 px-2 py-0.5 text-[13px] text-[#8a5300]">{i.observations}</p>}
                  </div>
                  <div className="text-right">
                    <Money value={i.lineTotal} strong />
                    {i.quantity > 1 && <p className="text-[12.5px] text-ink-3 tnum">{i.quantity} × <Money value={i.unitPrice} unit={false} /></p>}
                  </div>
                </li>
              ))}
            </ul>
            {order.notes && <p className="border-t border-line px-5 py-3 text-sm text-ink-2"><span className="font-medium text-ink">Notes :</span> {order.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Historique" />
            <ol className="relative border-t border-line px-5 py-4">
              {o.history.map(({ h, by }, idx) => (
                <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {idx < o.history.length - 1 && <span className="absolute left-[5px] top-4 h-full w-px bg-line" />}
                  <span className={cn("relative mt-1.5 size-[11px] shrink-0 rounded-full ring-4 ring-surface", h.toStatus === "ANNULEE" ? "bg-danger" : h.toStatus === "PRETE" ? "bg-success" : "bg-brand")} />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">
                      {h.fromStatus === h.toStatus ? "Commande modifiée" : h.fromStatus ? `${ORDER_STATUS_LABEL[h.fromStatus]} → ${ORDER_STATUS_LABEL[h.toStatus]}` : "Dépôt enregistré"}
                    </p>
                    <p className="text-ink-3 tnum">{formatDateTime(h.changedAt)} · {by ?? "—"}</p>
                    {h.reason && <p className="mt-0.5 text-ink-2">{h.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Téléphone : montant et actions avant le détail des articles */}
        <div className="order-first space-y-6 lg:order-none lg:sticky lg:top-24">
          <Card>
            <div className="p-5">
              <p className="eyebrow">Reste à payer</p>
              <p className={cn("mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em] tnum", remaining > 0 && order.status !== "ANNULEE" ? "text-ink" : "text-success")}>
                <Money value={Math.max(0, remaining)} />
              </p>
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-[14.5px]">
                <div className="flex justify-between"><dt className="text-ink-2">Sous-total</dt><dd><Money value={order.subtotal} /></dd></div>
                {order.expressAmount > 0 && <div className="flex justify-between"><dt className="text-ink-2">Express +{order.expressRatePct} %</dt><dd><Money value={order.expressAmount} /></dd></div>}
                {order.discountAmount > 0 && <div className="flex justify-between"><dt className="text-ink-2">Remise{order.discountType === "POURCENT" ? ` ${order.discountValue} %` : ""}</dt><dd className="text-success">−<Money value={order.discountAmount} /></dd></div>}
                <div className="flex justify-between font-semibold"><dt>Total</dt><dd><Money value={order.total} /></dd></div>
                <div className="flex justify-between"><dt className="text-ink-2">Déjà payé</dt><dd className="text-success"><Money value={order.amountPaid} /></dd></div>
              </dl>
            </div>
            {o.payments.length > 0 && (
              <div className="border-t border-line px-5 py-4">
                <p className="eyebrow mb-2">Paiements</p>
                <ul className="space-y-2.5">
                  {o.payments.map(({ p, by, voidedByName }) => (
                    <li key={p.id} className={cn("flex items-start justify-between gap-3 text-sm", p.voidedAt && "opacity-60")}>
                      <div>
                        <p className={cn("font-medium", p.voidedAt && "line-through")}>{METHOD_LABEL[p.method]}{p.reference && <span className="font-normal text-ink-3"> · {p.reference}</span>}</p>
                        <p className="text-[12.5px] text-ink-3 tnum">{formatDateTime(p.createdAt)} · {by}</p>
                        {p.voidedAt && <p className="text-[12.5px] text-danger">Annulé par {voidedByName} : {p.voidReason}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Money value={p.amount} strong className={cn(p.voidedAt && "line-through")} />
                        {isAdmin && !p.voidedAt && <VoidPaymentButton paymentId={p.id} amount={p.amount} />}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <OrderActions
            order={{
              id: order.id, number: order.number, status: order.status, total: order.total, amountPaid: order.amountPaid,
              isExpress: order.isExpress, dueAt: order.dueAt.toISOString(), notes: order.notes ?? "",
              discountType: order.discountType, discountValue: order.discountValue,
              items: o.items.map((i) => ({ id: i.id, label: `${i.itemLabel} · ${i.serviceLabel}`, quantity: i.quantity, color: i.color ?? "", brand: i.brand ?? "", observations: i.observations ?? "" })),
            }}
            isAdmin={isAdmin}
            hasOpenSession={!!session}
            cancelReason={order.cancelReason}
          />
        </div>
      </div>
    </div>
  );
}
