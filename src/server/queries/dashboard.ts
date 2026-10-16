import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, orders, payments, user } from "../db/schema";
import { periodStart, TZ } from "@/lib/domain/dates";
import { METHODS, type Method } from "@/lib/domain/cash";
import { getSettings } from "./settings";

export async function revenueByMethod(from: Date, to?: Date): Promise<Record<Method, number> & { total: number }> {
  const conds = [isNull(payments.voidedAt), gte(payments.createdAt, from)];
  if (to) conds.push(lt(payments.createdAt, to));
  const rows = await db.select({ method: payments.method, sum: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
    .from(payments).where(and(...conds)).groupBy(payments.method);
  const out = { ESPECES: 0, MTN_MOMO: 0, ORANGE_MONEY: 0, total: 0 } as Record<Method, number> & { total: number };
  for (const r of rows) { out[r.method] = r.sum; out.total += r.sum; }
  return out;
}

/** F-TDB-02 : en cours, prêtes non retirées, en retard, en souffrance. */
export async function getCounters() {
  const s = await getSettings();
  const now = new Date();
  const abandonedBefore = new Date(now.getTime() - s.abandonedAfterDays * 86_400_000);
  const [[a], [b], [c], [d], [e]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(inArray(orders.status, ["DEPOSEE", "EN_TRAITEMENT"])),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "PRETE")),
    db.select({ n: count() }).from(orders).where(and(inArray(orders.status, ["DEPOSEE", "EN_TRAITEMENT"]), lt(orders.dueAt, now))),
    db.select({ n: count() }).from(orders).where(and(eq(orders.status, "PRETE"), lt(orders.readyAt, abandonedBefore))),
    db.select({ n: count(), sum: sql<number>`coalesce(sum(${orders.total} - ${orders.amountPaid}),0)::int` }).from(orders)
      .where(and(sql`${orders.status} <> 'ANNULEE'`, sql`${orders.total} > ${orders.amountPaid}`)),
  ]);
  return { inProgress: a.n, ready: b.n, late: c.n, abandoned: d.n, unpaidCount: e.n, unpaidSum: e.sum, abandonedAfterDays: s.abandonedAfterDays };
}

export async function getManagerDashboard() {
  const [day, week, month, counters] = await Promise.all([
    revenueByMethod(periodStart("day")), revenueByMethod(periodStart("week")), revenueByMethod(periodStart("month")), getCounters(),
  ]);
  return { day, week, month, counters };
}

/** CA encaissé par mois (12 derniers mois) pour le graphique des rapports. */
export async function monthlyRevenue(months = 12) {
  const rows = await db.execute<{ month: string; total: number }>(sql`
    select to_char(date_trunc('month', ${payments.createdAt} at time zone ${TZ}), 'YYYY-MM') as month,
           coalesce(sum(${payments.amount}),0)::int as total
    from ${payments}
    where ${payments.voidedAt} is null
      and ${payments.createdAt} >= (date_trunc('month', now() at time zone ${TZ}) - make_interval(months => ${months - 1})) at time zone ${TZ}
    group by 1 order by 1`);
  const list = (rows as unknown as { rows?: { month: string; total: number }[] }).rows ?? (rows as unknown as { month: string; total: number }[]);
  return list.map((r) => ({ month: r.month, total: Number(r.total) }));
}

const orderBrief = {
  id: orders.id, number: orders.number, status: orders.status, total: orders.total, amountPaid: orders.amountPaid,
  dueAt: orders.dueAt, readyAt: orders.readyAt, createdAt: orders.createdAt, customerName: customers.fullName, customerPhone: customers.phone,
};

export async function lateOrders(limit = 8) {
  return db.select(orderBrief).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(inArray(orders.status, ["DEPOSEE", "EN_TRAITEMENT"]), lt(orders.dueAt, new Date())))
    .orderBy(asc(orders.dueAt)).limit(limit);
}

export async function unpaidOrders(limit = 100) {
  return db.select(orderBrief).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(sql`${orders.status} <> 'ANNULEE'`, sql`${orders.total} > ${orders.amountPaid}`))
    .orderBy(desc(sql`${orders.total} - ${orders.amountPaid}`)).limit(limit);
}

export async function abandonedOrders(limit = 100) {
  const s = await getSettings();
  return db.select(orderBrief).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.status, "PRETE"), lt(orders.readyAt, new Date(Date.now() - s.abandonedAfterDays * 86_400_000))))
    .orderBy(asc(orders.readyAt)).limit(limit);
}

export async function todaysOrders(limit = 10) {
  return db.select(orderBrief).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .where(gte(orders.createdAt, periodStart("day"))).orderBy(desc(orders.createdAt)).limit(limit);
}

export { METHODS };

export type DayPayment = {
  id: string; at: Date; amount: number; method: Method; reference: string | null; voided: boolean; voidReason: string | null;
  orderId: string; orderNumber: number; customer: string; agent: string | null;
};

/** Encaissements d'une journée (fuseau de Douala), éventuellement limités à un agent. */
export async function paymentsOfDay(from: Date, to: Date, userId?: string): Promise<DayPayment[]> {
  const conds = [gte(payments.createdAt, from), lt(payments.createdAt, to)];
  if (userId) conds.push(eq(payments.createdBy, userId));
  const rows = await db.select({
    id: payments.id, at: payments.createdAt, amount: payments.amount, method: payments.method, reference: payments.reference,
    voidedAt: payments.voidedAt, voidReason: payments.voidReason, orderId: orders.id, orderNumber: orders.number,
    customer: customers.fullName, agent: user.name,
  }).from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(user, eq(user.id, payments.createdBy))
    .where(and(...conds)).orderBy(desc(payments.createdAt));
  return rows.map(({ voidedAt, ...r }) => ({ ...r, method: r.method as Method, voided: !!voidedAt }));
}
