import { notFound } from "next/navigation";
import { getOrder } from "@/server/queries/orders";
import { formatLabelNumber } from "@/lib/domain/order-number";
import { formatDate } from "@/lib/domain/dates";

/** Une étiquette par pièce : « 000482-02 · Costume · NGONO » (UI/UX §5). */
export default async function Labels({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const o = await getOrder(id);
  if (!o) notFound();
  const lastName = o.customer.fullName.trim().split(/\s+/)[0].toUpperCase();
  const pieces = o.items.flatMap((i) => Array.from({ length: i.quantity }, () => i));
  return (
    <div>
      {pieces.map((i, n) => (
        <div key={n} className="label">
          <b>{formatLabelNumber(o.order.number, n + 1)}</b> · {i.itemLabel} · {lastName}
          <div style={{ fontSize: 11 }}>{i.serviceLabel} · prévu {formatDate(o.order.dueAt)}{o.order.isExpress ? " · EXPRESS" : ""}{i.observations ? ` · ${i.observations}` : ""}</div>
        </div>
      ))}
    </div>
  );
}
