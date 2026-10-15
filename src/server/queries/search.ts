import "server-only";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, orders } from "../db/schema";
import { classifyQuery } from "@/lib/domain/normalize";
import type { OrderStatus } from "@/lib/domain/status";

export interface CustomerHit { id: string; fullName: string; phone: string; openOrders: number; due: number }
export interface OrderHit {
  id: string; number: number; status: OrderStatus; customerName: string; total: number; amountPaid: number; dueAt: Date;
}

const openOrdersSql = sql<number>`(select count(*)::int from ${orders} o where o.customer_id = ${customers.id} and o.status in ('DEPOSEE','EN_TRAITEMENT','PRETE'))`;
const dueSql = sql<number>`(select coalesce(sum(o.total - o.amount_paid), 0)::int from ${orders} o where o.customer_id = ${customers.id} and o.status <> 'ANNULEE')`;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** F-CLI-01 à 04 : un seul champ, chiffres → téléphone partiel, lettres → chaque mot du nom. */
export async function searchCustomers(q: string, limit = 10): Promise<CustomerHit[]> {
  const c = classifyQuery(q);
  if (c.kind === "empty") return [];
  if (c.kind === "name" && c.value.length < 2) return [];
  if (c.kind !== "name" && c.value.length < 3) return [];
  const where = c.kind === "name"
    ? and(...c.words.map((w) => ilike(customers.searchName, `%${escapeLike(w)}%`)))
    : ilike(customers.phoneNormalized, `%${escapeLike(c.value)}%`);
  return db.select({
    id: customers.id, fullName: customers.fullName, phone: customers.phone, openOrders: openOrdersSql, due: dueSql,
  }).from(customers).where(where).orderBy(desc(customers.updatedAt)).limit(limit);
}

export async function findCustomersByPhone(phoneNormalized: string): Promise<CustomerHit[]> {
  return db.select({
    id: customers.id, fullName: customers.fullName, phone: customers.phone, openOrders: openOrdersSql, due: dueSql,
  }).from(customers).where(eq(customers.phoneNormalized, phoneNormalized)).limit(10);
}

/** F-RET-01 : n° de commande exact (1 à 6 chiffres), sinon commandes des clients trouvés. */
export async function searchOrders(q: string, limit = 8): Promise<OrderHit[]> {
  const c = classifyQuery(q);
  const base = () => db.select({
    id: orders.id, number: orders.number, status: orders.status, customerName: customers.fullName,
    total: orders.total, amountPaid: orders.amountPaid, dueAt: orders.dueAt,
  }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId));
  if (c.kind === "empty") return [];
  if (c.kind === "number") {
    const n = parseInt(c.value, 10);
    const exact = await base().where(eq(orders.number, n)).limit(1);
    if (exact.length || c.value.length < 3) return exact;
  }
  const found = await searchCustomers(q, 10);
  if (!found.length) return [];
  return base().where(inArray(orders.customerId, found.map((f) => f.id)))
    .orderBy(sql`case when ${orders.status} in ('PRETE','EN_TRAITEMENT','DEPOSEE') then 0 else 1 end`, desc(orders.createdAt))
    .limit(limit);
}
