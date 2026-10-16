import { notFound } from "next/navigation";
import { pageUser } from "@/server/session";
import { getOrder } from "@/server/queries/orders";
import { formatLabelNumber } from "@/lib/domain/order-number";
import { formatDate } from "@/lib/domain/dates";
import { formatKg } from "@/lib/domain/kilo";

/** Une étiquette par pièce : « 000482-02 · Costume · NGONO » (UI/UX §5). */
export default async function Labels({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  await pageUser();
  const o = await getOrder(id);
  if (!o) notFound();
  const lastName = o.customer.fullName.trim().split(/\s+/)[0].toUpperCase();
  // Une étiquette par pièce ; une seule pour un sac de linge au kilo ; aucune pour un achat de forfait.
  const pieces = o.items.flatMap((i) => (i.kind === "FORFAIT" ? [] : Array.from({ length: i.kind === "KILO" ? 1 : i.quantity }, () => i)));
  return (
    <div>
      {pieces.map((i, n) => (
        <div key={n} className="label">
          <b>{formatLabelNumber(o.order.number, n + 1)}</b> · {i.itemLabel}{i.kind === "KILO" ? ` ${formatKg(i.weightGrams ?? 0)}` : ""} · {lastName}
          <div style={{ fontSize: 11 }}>{i.serviceLabel} · prévu {formatDate(o.order.dueAt)}{o.order.isExpress ? " · EXPRESS" : ""}{i.description ? ` · ${i.description}` : ""}{i.observations ? ` · ${i.observations}` : ""}</div>
        </div>
      ))}
    </div>
  );
}
