import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { cashSessions, customers, expenses, orderItems, orders, payments, reservedNumbers, user } from "../db/schema";
import { getDepositCatalog } from "../queries/catalog";
import { getSettings } from "../queries/settings";
import { METHODS, type Method } from "@/lib/domain/cash";
import { NUMBER_BLOCK, REFILL_WHEN_LEFT, type OfflineOrder, type OfflineSession, type Snapshot } from "@/lib/offline/types";

/**
 * Numéros réservés au compte et pas encore utilisés. Quand il en reste un quart (75 % consommés),
 * un nouveau bloc de 200 est pris sur la séquence des tickets : ces numéros ne seront jamais
 * attribués en ligne, donc aucun doublon possible.
 */
export async function ensureNumberPool(userId: string): Promise<number[]> {
  const unused = async () => (await db.select({ n: reservedNumbers.number }).from(reservedNumbers)
    .where(and(eq(reservedNumbers.userId, userId), isNull(reservedNumbers.usedAt))).orderBy(asc(reservedNumbers.number))).map((r) => Number(r.n));
  let list = await unused();
  if (list.length <= REFILL_WHEN_LEFT) {
    await db.execute(sql`insert into reserved_numbers (number, user_id)
      select nextval('order_number_seq'), ${userId} from generate_series(1, ${NUMBER_BLOCK})`);
    list = await unused();
  }
  return list;
}

export async function activeOrders(): Promise<OfflineOrder[]> {
  const rows = await db.select({ o: orders, c: customers, by: user.name }).from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId)).leftJoin(user, eq(user.id, orders.createdBy))
    .where(inArray(orders.status, ["DEPOSEE", "EN_TRAITEMENT", "PRETE"])).orderBy(desc(orders.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.o.id);
  const [items, pays] = await Promise.all([
    db.select().from(orderItems).where(inArray(orderItems.orderId, ids)).orderBy(asc(orderItems.lineNo)),
    db.select({ orderId: payments.orderId, method: payments.method }).from(payments)
      .where(and(inArray(payments.orderId, ids), isNull(payments.voidedAt))).orderBy(asc(payments.createdAt)),
  ]);
  return rows.map(({ o, c, by }) => ({
    id: o.id, number: Number(o.number), status: o.status as OfflineOrder["status"],
    customerId: c.id, customerName: c.fullName, customerPhone: c.phone,
    isExpress: o.isExpress, expressRatePct: o.expressRatePct, subtotal: o.subtotal, expressAmount: o.expressAmount, discountAmount: o.discountAmount,
    total: o.total, amountPaid: o.amountPaid, dueAt: o.dueAt.toISOString(), createdAt: o.createdAt.toISOString(),
    collectedAt: o.collectedAt?.toISOString() ?? null, notes: o.notes,
    lastMethod: (pays.filter((p) => p.orderId === o.id).at(-1)?.method as Method | undefined) ?? null,
    createdByName: by ?? "",
    items: items.filter((i) => i.orderId === o.id).map((i) => ({
      itemLabel: i.itemLabel, serviceLabel: i.serviceLabel, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal,
      color: i.color, brand: i.brand, observations: i.observations,
    })),
  }));
}

async function openSession(userId: string): Promise<OfflineSession | null> {
  const [s] = await db.select().from(cashSessions).where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, "OUVERTE"))).limit(1);
  if (!s) return null;
  const [pays, exps] = await Promise.all([
    db.select({ p: payments, number: orders.number }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(eq(payments.cashSessionId, s.id), isNull(payments.voidedAt))),
    db.select().from(expenses).where(and(eq(expenses.cashSessionId, s.id), isNull(expenses.voidedAt))),
  ]);
  const zero = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<Method, number>;
  const received = zero(), spent = zero();
  for (const { p } of pays) received[p.method] += p.amount;
  for (const e of exps) spent[e.method] += e.amount;
  return {
    id: s.id, openedAt: s.openedAt.toISOString(), openingFloat: s.openingFloat, received, spent,
    moves: [
      ...pays.map(({ p, number }) => ({ id: p.id, kind: "PAIEMENT" as const, label: `Ticket n° ${number}`, method: p.method, amount: p.amount, at: p.createdAt.toISOString() })),
      ...exps.map((e) => ({ id: e.id, kind: "DEPENSE" as const, label: e.label, method: e.method, amount: e.amount, at: e.createdAt.toISOString() })),
    ].sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/** Tout ce qu'il faut pour travailler hors ligne au comptoir. */
export async function buildSnapshot(u: Snapshot["user"], expiresAt: Date): Promise<Snapshot> {
  const [settings, catalog, custs, ords, session, numbers] = await Promise.all([
    getSettings(), getDepositCatalog(),
    db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone, searchName: customers.searchName, phoneNormalized: customers.phoneNormalized })
      .from(customers).orderBy(asc(customers.fullName)),
    activeOrders(), openSession(u.id), ensureNumberPool(u.id),
  ]);
  return {
    user: u, expiresAt: expiresAt.toISOString(), serverTime: new Date().toISOString(),
    settings: {
      shopName: settings.shopName, address: settings.address, phones: settings.phones, ticketFooter: settings.ticketFooter,
      website: settings.website, paperFormat: settings.paperFormat,
      standardDelayHours: settings.standardDelayHours, expressDelayHours: settings.expressDelayHours, expressRatePct: settings.expressRatePct,
    },
    catalog, customers: custs, orders: ords, session, numbers,
  };
}
