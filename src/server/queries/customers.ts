import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, orders } from "../db/schema";
import { searchCustomers } from "./search";

const openOrders = sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers.id} and o.status in ('DEPOSEE','EN_TRAITEMENT','PRETE'))`;
const ordersCount = sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers.id})`;
const due = sql<number>`(select coalesce(sum(o.total - o.amount_paid), 0)::int from ${orders} o where o.customer_id = ${customers.id} and o.status <> 'ANNULEE')`;

export async function listCustomers(q: string, page = 1) {
  if (q.trim()) return { rows: await searchCustomers(q, 50), pages: 1 };
  const size = 40;
  // Les clients les plus récemment créés en tête.
  const rows = await db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone, openOrders, ordersCount, due })
    .from(customers).orderBy(desc(customers.createdAt)).limit(size).offset((page - 1) * size);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(customers);
  return { rows, pages: Math.max(1, Math.ceil(n / size)) };
}

export async function getCustomer(id: string) {
  const [c] = await db.select({ c: customers, openOrders, due }).from(customers).where(eq(customers.id, id)).limit(1);
  if (!c) return null;
  const history = await db.select({
    id: orders.id, number: orders.number, status: orders.status, total: orders.total, amountPaid: orders.amountPaid,
    createdAt: orders.createdAt, dueAt: orders.dueAt, readyAt: orders.readyAt,
  }).from(orders).where(eq(orders.customerId, id)).orderBy(desc(orders.createdAt));
  return { ...c.c, openOrders: c.openOrders, due: c.due, orders: history };
}
