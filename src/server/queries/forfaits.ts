import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { forfaitMoves, forfaits, orders, user } from "../db/schema";

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
