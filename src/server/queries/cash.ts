import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
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
    .where(eq(cashSessions.status, "FERMEE")).orderBy(desc(cashSessions.openedAt)).limit(onlyGaps ? 200 : limit);
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

/**
 * Caisses d'une période (sur la date d'ouverture), d'un agent, éventuellement celles avec écart seulement.
 * `includeOpen` ajoute les caisses encore ouvertes (journée en cours).
 * `receivedInPeriod` ne compte que les paiements datés dans la période : c'est ce total qui se compare aux ventes
 * des rapports (une caisse laissée ouverte la nuit peut encaisser sur deux mois).
 */
export async function listSessionsFiltered(f: { from: Date; to: Date; userId?: string; onlyGaps?: boolean; includeOpen?: boolean }) {
  const conds = [f.includeOpen ? inArray(cashSessions.status, ["FERMEE", "OUVERTE"]) : eq(cashSessions.status, "FERMEE"), gte(cashSessions.openedAt, f.from), lt(cashSessions.openedAt, f.to)];
  if (f.userId) conds.push(eq(cashSessions.userId, f.userId));
  const sessions = await db.select({ s: cashSessions, userName: user.name }).from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.userId)).where(and(...conds)).orderBy(desc(cashSessions.openedAt));
  if (!sessions.length) return [];
  const ids = sessions.map((x) => x.s.id);
  const [counts, received] = await Promise.all([
    db.select().from(cashSessionCounts).where(inArray(cashSessionCounts.cashSessionId, ids)),
    db.select({
      id: payments.cashSessionId, total: sql<number>`coalesce(sum(${payments.amount}),0)::int`,
      inPeriod: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.createdAt} >= ${f.from} and ${payments.createdAt} < ${f.to}),0)::int`,
    }).from(payments).where(and(inArray(payments.cashSessionId, ids), isNull(payments.voidedAt))).groupBy(payments.cashSessionId),
  ]);
  const out = sessions.map(({ s, userName }) => {
    const c = counts.filter((k) => k.cashSessionId === s.id);
    const r = received.find((x) => x.id === s.id);
    return {
      id: s.id, userName, open: s.status === "OUVERTE", openedAt: s.openedAt, closedAt: s.closedAt, comment: s.closingComment,
      received: Number(r?.total ?? 0), receivedInPeriod: Number(r?.inPeriod ?? 0),
      expected: c.reduce((a, k) => a + k.expected, 0), counted: c.reduce((a, k) => a + k.counted, 0),
      difference: c.reduce((a, k) => a + k.difference, 0),
    };
  });
  return f.onlyGaps ? out.filter((x) => x.difference !== 0) : out;
}

/** Total encaissé (paiements non annulés) entre deux dates, toutes caisses ou celles d'un agent : même base que les ventes des rapports. */
export async function receivedBetween(from: Date, to: Date, userId?: string) {
  const conds = [isNull(payments.voidedAt), gte(payments.createdAt, from), lt(payments.createdAt, to)];
  if (userId) conds.push(eq(cashSessions.userId, userId));
  const [r] = await db.select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` }).from(payments)
    .innerJoin(cashSessions, eq(cashSessions.id, payments.cashSessionId)).where(and(...conds));
  return Number(r.total);
}

export async function listCashiers() {
  return db.selectDistinct({ id: user.id, name: user.name }).from(cashSessions).innerJoin(user, eq(user.id, cashSessions.userId)).orderBy(user.name);
}

export async function listOpenSessions() {
  return db.select({ id: cashSessions.id, openedAt: cashSessions.openedAt, userName: user.name }).from(cashSessions)
    .leftJoin(user, eq(user.id, cashSessions.userId)).where(eq(cashSessions.status, "OUVERTE"));
}
