import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { customers, orders } from "@/server/db/schema";
import { getCurrentUser } from "@/server/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/domain/dates";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { ORDER_STATUS_LABEL, computePaymentStatus, PAYMENT_STATUS_LABEL } from "@/lib/domain/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return new Response("Accès refusé", { status: 403 });
  const rows = await db.select({ o: orders, name: customers.fullName, phone: customers.phone })
    .from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).orderBy(desc(orders.number));
  const body = toCsv(
    ["N°", "Déposée", "Client", "Téléphone", "Statut", "Express", "Sous-total", "Majoration", "Remise", "Total", "Payé", "Reste", "Paiement", "Prévue", "Prête", "Retirée", "Annulée", "Motif annulation"],
    rows.map(({ o, name, phone }) => [
      formatOrderNumber(o.number), formatDateTime(o.createdAt), name, phone, ORDER_STATUS_LABEL[o.status], o.isExpress ? "oui" : "non",
      o.subtotal, o.expressAmount, o.discountAmount, o.total, o.amountPaid, o.total - o.amountPaid,
      PAYMENT_STATUS_LABEL[computePaymentStatus(o.amountPaid, o.total)], formatDateTime(o.dueAt),
      o.readyAt ? formatDateTime(o.readyAt) : "", o.collectedAt ? formatDateTime(o.collectedAt) : "",
      o.cancelledAt ? formatDateTime(o.cancelledAt) : "", o.cancelReason,
    ]),
  );
  return csvResponse(`commandes-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
