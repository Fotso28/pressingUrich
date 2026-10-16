import "server-only";
import { and, asc, count, desc, eq, gt, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { customers, orderItems, orderStatusHistory, orders, payments, user } from "../db/schema";
import type { OrderStatus } from "@/lib/domain/status";

export type OrdersTab = "a-traiter" | "pretes" | "retirees" | "annulees" | "toutes";
export const TAB_STATUSES: Record<OrdersTab, OrderStatus[] | null> = {
  "a-traiter": ["DEPOSEE", "EN_TRAITEMENT"],
  pretes: ["PRETE"],
  retirees: ["RETIREE"],
  annulees: ["ANNULEE"],
  toutes: null,
};

export interface OrderFilters { tab: OrdersTab; late?: boolean; unpaid?: boolean; from?: Date; to?: Date; customerId?: string; page?: number }
export const PAGE_SIZE = 30;

const itemsCount = sql<number>`(select coalesce(sum(quantity),0)::int from ${orderItems} where ${orderItems.orderId} = ${orders.id})`;

function filterWhere(f: Omit<OrderFilters, "tab"> & { statuses: OrderStatus[] | null }): SQL | undefined {
  const conds: SQL[] = [];
  if (f.statuses) conds.push(inArray(orders.status, f.statuses));
  if (f.late) conds.push(inArray(orders.status, ["DEPOSEE", "EN_TRAITEMENT"]), lt(orders.dueAt, new Date()));
  if (f.unpaid) conds.push(ne(orders.status, "ANNULEE"), gt(sql`${orders.total} - ${orders.amountPaid}`, 0));
  if (f.from) conds.push(sql`${orders.createdAt} >= ${f.from}`);
  if (f.to) conds.push(sql`${orders.createdAt} < ${f.to}`);
  if (f.customerId) conds.push(eq(orders.customerId, f.customerId));
  return conds.length ? and(...conds) : undefined;
}

export async function listOrders(f: OrderFilters) {
  const statuses = TAB_STATUSES[f.tab];
  const where = filterWhere({ ...f, statuses });
  const page = Math.max(1, f.page ?? 1);
  // Toutes les listes : la dernière commande enregistrée en tête.
  const order = [desc(orders.createdAt)];
  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: orders.id, number: orders.number, status: orders.status, total: orders.total, amountPaid: orders.amountPaid,
      dueAt: orders.dueAt, readyAt: orders.readyAt, createdAt: orders.createdAt, isExpress: orders.isExpress,
      customerId: customers.id, customerName: customers.fullName, customerPhone: customers.phone, itemsCount,
    }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
      .where(where).orderBy(...order).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
export type OrderRow = Awaited<ReturnType<typeof listOrders>>["rows"][number];

/** Nombre de commandes par onglet, avec les mêmes filtres que la liste (période, client, retard, impayé). */
export async function countByTab(f: Omit<OrderFilters, "tab" | "page"> = {}): Promise<Record<OrdersTab, number>> {
  const rows = await db.select({ status: orders.status, n: count() }).from(orders).where(filterWhere({ ...f, statuses: null })).groupBy(orders.status);
  const by = (s: OrderStatus[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
  return {
    "a-traiter": by(["DEPOSEE", "EN_TRAITEMENT"]), pretes: by(["PRETE"]), retirees: by(["RETIREE"]),
    annulees: by(["ANNULEE"]), toutes: rows.reduce((a, r) => a + r.n, 0),
  };
}

export async function getOrder(id: string) {
  const [o] = await db.select({
    order: orders,
    customer: { id: customers.id, fullName: customers.fullName, phone: customers.phone },
    createdByName: user.name,
  }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .leftJoin(user, eq(user.id, orders.createdBy))
    .where(eq(orders.id, id)).limit(1);
  if (!o) return null;
  const voider = alias(user, "voider");
  const [items, pays, history] = await Promise.all([
    db.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.lineNo)),
    db.select({ p: payments, by: user.name, voidedByName: voider.name }).from(payments)
      .leftJoin(user, eq(user.id, payments.createdBy))
      .leftJoin(voider, eq(voider.id, payments.voidedBy))
      .where(eq(payments.orderId, id)).orderBy(asc(payments.createdAt)),
    db.select({ h: orderStatusHistory, by: user.name }).from(orderStatusHistory)
      .leftJoin(user, eq(user.id, orderStatusHistory.changedBy))
      .where(eq(orderStatusHistory.orderId, id)).orderBy(asc(orderStatusHistory.changedAt)),
  ]);
  return { ...o, items, payments: pays, history };
}
export type OrderDetail = NonNullable<Awaited<ReturnType<typeof getOrder>>>;
