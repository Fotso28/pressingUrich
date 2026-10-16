import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { customers, orderItems, orders, user } from "@/server/db/schema";
import { exportRange } from "@/lib/export-range";
import { getCurrentUser } from "@/server/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/domain/dates";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { ORDER_STATUS_LABEL, computePaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/domain/status";

export const dynamic = "force-dynamic";

/** Commandes déposées sur la période (`?mois=AAAA-MM`), ou tout l'historique. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return new Response("Accès refusé", { status: 403 });
  const { from, to, suffix } = exportRange(req);
  const where: SQL[] = [];
  if (from && to) where.push(gte(orders.createdAt, from), lt(orders.createdAt, to));
  const agent = alias(user, "agent");
  const rows = await db.select({
    o: orders, name: customers.fullName, phone: customers.phone, agent: agent.name,
    pieces: sql<number>`(select coalesce(sum(${orderItems.quantity}),0)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`,
  }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).leftJoin(agent, eq(agent.id, orders.createdBy))
    .where(where.length ? and(...where) : undefined).orderBy(desc(orders.number));
  const body = toCsv(
    ["N°", "Déposée", "Agent", "Client", "Téléphone", "Statut", "Pièces", "Express", "Sous-total", "Majoration", "Remise", "Total", "Payé", "Reste", "Paiement", "Prévue", "Prête", "Retirée", "Annulée", "Motif annulation", "Notes"],
    rows.map(({ o, name, phone, agent, pieces }) => [
      formatOrderNumber(o.number), formatDateTime(o.createdAt), agent, name, phone, ORDER_STATUS_LABEL[o.status], pieces, o.isExpress ? "oui" : "non",
      o.subtotal, o.expressAmount, o.discountAmount, o.total, o.amountPaid, o.total - o.amountPaid,
      PAYMENT_STATUS_LABEL[computePaymentStatus(o.amountPaid, o.total)], formatDateTime(o.dueAt),
      o.readyAt ? formatDateTime(o.readyAt) : "", o.collectedAt ? formatDateTime(o.collectedAt) : "",
      o.cancelledAt ? formatDateTime(o.cancelledAt) : "", o.cancelReason, o.notes,
    ]),
  );
  return csvResponse(`commandes-${suffix}.csv`, body);
}
