import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { customers, orders, payments, user } from "@/server/db/schema";
import { getCurrentUser } from "@/server/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/domain/dates";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { METHOD_LABEL } from "@/lib/domain/cash";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return new Response("Accès refusé", { status: 403 });
  const rows = await db.select({ p: payments, number: orders.number, name: customers.fullName, agent: user.name })
    .from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(user, eq(user.id, payments.createdBy)).orderBy(desc(payments.createdAt));
  const body = toCsv(
    ["Date", "N° commande", "Client", "Mode", "Montant", "Référence", "Agent", "Annulé le", "Motif annulation"],
    rows.map(({ p, number, name, agent }) => [
      formatDateTime(p.createdAt), formatOrderNumber(number), name, METHOD_LABEL[p.method], p.amount, p.reference, agent,
      p.voidedAt ? formatDateTime(p.voidedAt) : "", p.voidReason,
    ]),
  );
  return csvResponse(`paiements-${new Date().toISOString().slice(0, 10)}.csv`, body);
}
