import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { expenses, outflows, user } from "@/server/db/schema";
import { getCurrentUser } from "@/server/session";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/domain/dates";
import { expenseToOutflowCategory, METHOD_LABEL, OUTFLOW_CATEGORY_LABEL, OUTFLOW_METHOD_LABEL, type OutflowMethod } from "@/lib/domain/cash";
import { exportRange } from "@/lib/export-range";

export const dynamic = "force-dynamic";

/** Toutes les sorties d'argent (gérant + dépenses de caisse, salaires compris) sur la période, ou tout l'historique. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || u.role !== "ADMIN") return new Response("Accès refusé", { status: 403 });
  const { from, to, suffix } = exportRange(req);
  const [out, exp] = await Promise.all([
    db.select({ x: outflows, by: user.name }).from(outflows).leftJoin(user, eq(user.id, outflows.createdBy))
      .where(from && to ? and(gte(outflows.occurredAt, from), lt(outflows.occurredAt, to)) : undefined).orderBy(desc(outflows.occurredAt)),
    db.select({ x: expenses, by: user.name }).from(expenses).leftJoin(user, eq(user.id, expenses.createdBy))
      .where(from && to ? and(gte(expenses.createdAt, from), lt(expenses.createdAt, to)) : undefined).orderBy(desc(expenses.createdAt)),
  ]);
  const rows = [
    ...out.map(({ x, by }) => ({ at: x.occurredAt, row: [formatDateTime(x.occurredAt), "Sortie du gérant", OUTFLOW_CATEGORY_LABEL[x.category], x.label, x.beneficiary, x.salaryPeriod, OUTFLOW_METHOD_LABEL[x.method as OutflowMethod], x.amount, by, x.notes, x.voidedAt ? formatDateTime(x.voidedAt) : "", x.voidReason] })),
    ...exp.map(({ x, by }) => ({ at: x.createdAt, row: [formatDateTime(x.createdAt), "Dépense de caisse", OUTFLOW_CATEGORY_LABEL[expenseToOutflowCategory(x.category)], x.label, "", "", METHOD_LABEL[x.method], x.amount, by, "", x.voidedAt ? formatDateTime(x.voidedAt) : "", x.voidReason] })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).map((r) => r.row);
  const body = toCsv(["Date", "Origine", "Catégorie", "Libellé", "Bénéficiaire", "Mois de salaire", "Mode", "Montant", "Saisi par", "Notes", "Annulée le", "Motif annulation"], rows);
  return csvResponse(`sorties-${suffix}.csv`, body);
}
