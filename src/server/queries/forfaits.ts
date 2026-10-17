import "server-only";
import { and, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, forfaitMoves, forfaits, orderItems, orders, user } from "../db/schema";

export type Forfait = { id: string; name: string; price: number; grams: number; active: boolean };

/** Forfaits au kilo, les plus récents en tête. */
export async function listForfaits(): Promise<Forfait[]> {
  return db.select({ id: forfaits.id, name: forfaits.name, price: forfaits.price, grams: forfaits.grams, active: forfaits.active })
    .from(forfaits).orderBy(desc(forfaits.createdAt));
}

/** Solde forfait d'un client (grammes) et historique des mouvements, les plus récents en tête. */
export async function customerForfait(customerId: string) {
  const [balance, moves] = await Promise.all([
    db.select({ g: sql<number>`coalesce(sum(${forfaitMoves.grams}),0)::int` }).from(forfaitMoves).where(eq(forfaitMoves.customerId, customerId)),
    db.select({ id: forfaitMoves.id, kind: forfaitMoves.kind, grams: forfaitMoves.grams, label: forfaitMoves.label, at: forfaitMoves.createdAt,
      orderId: forfaitMoves.orderId, orderNumber: orders.number, by: user.name })
      .from(forfaitMoves).leftJoin(orders, eq(orders.id, forfaitMoves.orderId)).leftJoin(user, eq(user.id, forfaitMoves.createdBy))
      .where(eq(forfaitMoves.customerId, customerId)).orderBy(desc(forfaitMoves.createdAt)).limit(100),
  ]);
  return { balanceGrams: Number(balance[0]?.g ?? 0), moves };
}

/** Clients ayant (eu) un forfait : solde restant, kilos achetés et consommés, dernier mouvement en tête. */
export async function forfaitBalances() {
  const rows = await db.select({
    customerId: forfaitMoves.customerId, fullName: customers.fullName, phone: customers.phone,
    balance: sql<number>`sum(${forfaitMoves.grams})::int`,
    bought: sql<number>`coalesce(sum(${forfaitMoves.grams}) filter (where ${forfaitMoves.kind} = 'ACHAT'), 0)::int`,
    used: sql<number>`coalesce(-sum(${forfaitMoves.grams}) filter (where ${forfaitMoves.kind} = 'CONSO'), 0)::int`,
    lastAt: sql<Date>`max(${forfaitMoves.createdAt})`,
  }).from(forfaitMoves).innerJoin(customers, eq(customers.id, forfaitMoves.customerId))
    .groupBy(forfaitMoves.customerId, customers.fullName, customers.phone).orderBy(desc(sql`max(${forfaitMoves.createdAt})`));
  return rows.map((r) => ({ ...r, balance: Number(r.balance), bought: Number(r.bought), used: Number(r.used), lastAt: new Date(r.lastAt) }));
}

/** Mouvements de forfait d'une période (et d'un client), les plus récents en tête. */
export async function forfaitMovesBetween(f: { from?: Date; to?: Date; customerId?: string }) {
  const conds = [];
  if (f.from) conds.push(gte(forfaitMoves.createdAt, f.from));
  if (f.to) conds.push(lt(forfaitMoves.createdAt, f.to));
  if (f.customerId) conds.push(eq(forfaitMoves.customerId, f.customerId));
  return db.select({
    id: forfaitMoves.id, kind: forfaitMoves.kind, grams: forfaitMoves.grams, label: forfaitMoves.label, at: forfaitMoves.createdAt,
    customerId: forfaitMoves.customerId, customerName: customers.fullName, orderId: forfaitMoves.orderId, orderNumber: orders.number, by: user.name,
  }).from(forfaitMoves).innerJoin(customers, eq(customers.id, forfaitMoves.customerId))
    .leftJoin(orders, eq(orders.id, forfaitMoves.orderId)).leftJoin(user, eq(user.id, forfaitMoves.createdBy))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(forfaitMoves.createdAt));
}

/** Forfaits vendus sur une période : nombre et montant (commandes non annulées). */
export async function forfaitSales(from?: Date, to?: Date) {
  const conds = [eq(orderItems.kind, "FORFAIT"), ne(orders.status, "ANNULEE")];
  if (from) conds.push(gte(orders.createdAt, from));
  if (to) conds.push(lt(orders.createdAt, to));
  const [r] = await db.select({ n: sql<number>`count(*)::int`, amount: sql<number>`coalesce(sum(${orderItems.lineTotal}),0)::int` })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(and(...conds));
  return { count: Number(r?.n ?? 0), amount: Number(r?.amount ?? 0) };
}
