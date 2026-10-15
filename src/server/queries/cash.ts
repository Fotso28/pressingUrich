import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { cashSessionCounts, cashSessions, customers, expenses, orders, payments, user } from "../db/schema";
import { computeCashExpected } from "@/lib/domain/cash";

export async function getOpenCashSession(userId: string) {
  const [s] = await db.select().from(cashSessions)
    .where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, "OUVERTE"))).limit(1);
  return s ?? null;
}

/** RG-09 : fond + Σ paiements − Σ dépenses, par mode, hors annulés. */
export async function getCashSessionSummary(id: string) {
  const [s] = await db.select({ s: cashSessions, userName: user.name }).from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.userId)).where(eq(cashSessions.id, id)).limit(1);
  if (!s) return null;
  const [pays, exps, counts] = await Promise.all([
    db.select({ p: payments, orderNumber: orders.number, customerName: customers.fullName }).from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId)).innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(payments.cashSessionId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(expenses).where(eq(expenses.cashSessionId, id)).orderBy(desc(expenses.createdAt)),
    db.select().from(cashSessionCounts).where(eq(cashSessionCounts.cashSessionId, id)),
  ]);
  const rows = computeCashExpected(s.s.openingFloat,
    pays.map(({ p }) => ({ method: p.method, amount: p.amount, voided: !!p.voidedAt })),
    exps.map((e) => ({ method: e.method, amount: e.amount, voided: !!e.voidedAt })));
  return { session: s.s, userName: s.userName, rows, payments: pays, expenses: exps, counts };
}

export async function listClosedSessions(limit = 60, onlyGaps = false) {
  const sessions = await db.select({ s: cashSessions, userName: user.name }).from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.userId))
    .where(eq(cashSessions.status, "FERMEE")).orderBy(desc(cashSessions.closedAt)).limit(onlyGaps ? 200 : limit);
  if (!sessions.length) return [];
  const counts = await db.select().from(cashSessionCounts).where(inArray(cashSessionCounts.cashSessionId, sessions.map((x) => x.s.id)));
  const out = sessions.map(({ s, userName }) => {
    const c = counts.filter((k) => k.cashSessionId === s.id);
    return {
      id: s.id, userName, openedAt: s.openedAt, closedAt: s.closedAt, comment: s.closingComment,
      expected: c.reduce((a, k) => a + k.expected, 0), counted: c.reduce((a, k) => a + k.counted, 0),
      difference: c.reduce((a, k) => a + k.difference, 0), counts: c,
    };
  });
  return onlyGaps ? out.filter((x) => x.counts.some((k) => k.difference !== 0)).slice(0, limit) : out;
}

export async function listOpenSessions() {
  return db.select({ id: cashSessions.id, openedAt: cashSessions.openedAt, userName: user.name }).from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.userId)).where(eq(cashSessions.status, "OUVERTE"));
}
