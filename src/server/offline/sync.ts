import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatAmount } from "@/lib/domain/money";
import { db, type Tx } from "../db";
import {
  cashSessionCounts, cashSessions, customers, expenses, offlineOps, orderItems, orderStatusHistory, orders, payments,
  reservedNumbers,
} from "../db/schema";
import { DomainError, pgCode } from "../action-utils";
import { itemRows, orderLineSchema, recordMoves, resolveLines } from "../orders/lines";
import { getSettings } from "../queries/settings";
import { computeCashExpected, EXPENSE_CATEGORIES, METHODS, type Method } from "@/lib/domain/cash";
import { computeOrderTotals } from "@/lib/domain/totals";
import { isValidPhone, normalizeName, normalizePhone } from "@/lib/domain/normalize";
import type { OfflineOp, OpResult, Snapshot } from "@/lib/offline/types";
import "../action-utils"; // messages zod en français

const fail = (m: string): never => { throw new DomainError(m); };
const method = z.enum(["ESPECES", "MTN_MOMO", "ORANGE_MONEY"]);
const amount = z.number().int().min(0).max(100_000_000);
const text = z.string().trim().max(500).nullable();
const base = { opId: z.uuid(), at: z.iso.datetime() };
const opSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("OPEN_CASH"), sessionId: z.uuid(), openingFloat: amount }),
  z.object({ ...base, type: z.literal("CREATE_CUSTOMER"), id: z.uuid(), fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(30) }),
  z.object({
    ...base, type: z.literal("CREATE_ORDER"), id: z.uuid(), number: z.number().int().positive(), customerId: z.uuid(), isExpress: z.boolean(),
    dueAt: z.iso.datetime(), notes: text,
    lines: z.array(orderLineSchema).min(1).max(100),
    deposit: z.object({ paymentId: z.uuid(), sessionId: z.uuid(), amount: amount.min(1), method, reference: text }).nullable(),
  }),
  z.object({ ...base, type: z.literal("ADD_PAYMENT"), paymentId: z.uuid(), orderId: z.uuid(), sessionId: z.uuid(), amount: amount.min(1), method, reference: text }),
  z.object({ ...base, type: z.literal("COLLECT_ORDER"), orderId: z.uuid() }),
  z.object({ ...base, type: z.literal("ADD_EXPENSE"), expenseId: z.uuid(), sessionId: z.uuid(), label: z.string().trim().min(2).max(200), category: z.enum(EXPENSE_CATEGORIES), method, amount: amount.min(1) }),
  z.object({ ...base, type: z.literal("CLOSE_CASH"), sessionId: z.uuid(), counts: z.object({ ESPECES: amount, MTN_MOMO: amount, ORANGE_MONEY: amount }), comment: text }),
]);
export const syncBodySchema = z.object({ userId: z.string().min(1), ops: z.array(z.unknown()).max(500) });

/** Date de l'opération telle que vécue hors ligne, bornée : pas dans le futur, pas avant la durée de session (7 jours). */
function when(at: string): Date {
  const d = new Date(at), now = Date.now();
  if (Number.isNaN(d.getTime()) || d.getTime() > now + 5 * 60_000 || d.getTime() < now - 7 * 86_400_000) return new Date();
  return d;
}

/** Caisse visée par une opération : l'identifiant local, ou la caisse du serveur qui l'a remplacée. */
async function resolveSession(tx: Tx, userId: string, id: string, mustBeOpen = true): Promise<string> {
  const [own] = await tx.select({ id: cashSessions.id, status: cashSessions.status }).from(cashSessions)
    .where(and(eq(cashSessions.id, id), eq(cashSessions.userId, userId))).limit(1);
  if (own) {
    if (mustBeOpen && own.status !== "OUVERTE") fail("Cette caisse est déjà clôturée.");
    return own.id;
  }
  const [mapped] = await tx.select({ result: offlineOps.result }).from(offlineOps)
    .where(and(eq(offlineOps.userId, userId), eq(offlineOps.type, "OPEN_CASH"), sql`${offlineOps.payload}->>'sessionId' = ${id}`)).limit(1);
  const target = (mapped?.result as { sessionId?: string } | null)?.sessionId;
  if (target) return resolveSession(tx, userId, target, mustBeOpen);
  return fail("Caisse introuvable : ouvrez une caisse.");
}

async function apply(tx: Tx, u: Snapshot["user"], op: z.infer<typeof opSchema>): Promise<Record<string, unknown>> {
  const at = when(op.at);
  switch (op.type) {
    case "OPEN_CASH": {
      const [open] = await tx.select({ id: cashSessions.id }).from(cashSessions)
        .where(and(eq(cashSessions.userId, u.id), eq(cashSessions.status, "OUVERTE"))).limit(1);
      if (open) return { sessionId: open.id, merged: true }; // une caisse était déjà ouverte (autre appareil) : on la reprend
      await tx.insert(cashSessions).values({ id: op.sessionId, userId: u.id, openingFloat: op.openingFloat, openedAt: at });
      return { sessionId: op.sessionId };
    }
    case "CREATE_CUSTOMER": {
      if (!isValidPhone(op.phone)) fail("Téléphone invalide.");
      await tx.insert(customers).values({
        id: op.id, fullName: op.fullName, phone: op.phone, searchName: normalizeName(op.fullName), phoneNormalized: normalizePhone(op.phone),
        createdAt: at, updatedAt: at,
      }).onConflictDoNothing();
      return { id: op.id };
    }
    case "CREATE_ORDER": {
      const settings = await getSettings();
      const { lines, moves } = await resolveLines(tx, op.customerId, op.lines, settings.kiloPrice);
      const expressRatePct = op.isExpress ? settings.expressRatePct : 0;
      const totals = computeOrderTotals(lines, { isExpress: op.isExpress, expressRatePct, discount: null });
      if (op.deposit && op.deposit.amount > totals.total) fail("L'acompte dépasse le total.");
      // Numéro du bloc réservé à ce compte ; sinon (bloc expiré, autre appareil) un numéro neuf.
      const [reserved] = await tx.select().from(reservedNumbers)
        .where(and(eq(reservedNumbers.number, op.number), eq(reservedNumbers.userId, u.id), isNull(reservedNumbers.usedAt))).for("update");
      const [{ n }] = reserved ? [{ n: op.number }] : await tx.execute(sql`select nextval('order_number_seq')::bigint as n`).then((r) => ((r as unknown as { rows?: { n: number }[] }).rows ?? (r as unknown as { n: number }[])));
      const number = Number(n);
      const sessionId = op.deposit ? await resolveSession(tx, u.id, op.deposit.sessionId) : null;
      await tx.insert(orders).values({
        id: op.id, number, customerId: op.customerId, isExpress: op.isExpress, expressRatePct,
        subtotal: totals.subtotal, expressAmount: totals.expressAmount, discountType: null, discountValue: 0, discountAmount: 0,
        total: totals.total, amountPaid: op.deposit?.amount ?? 0, dueAt: new Date(op.dueAt), notes: op.notes,
        idempotencyKey: op.opId, createdBy: u.id, createdAt: at, updatedAt: at,
      });
      await tx.insert(orderItems).values(itemRows(op.id, lines));
      await recordMoves(tx, op.customerId, op.id, u.id, moves, at);
      await tx.insert(orderStatusHistory).values({ orderId: op.id, fromStatus: null, toStatus: "DEPOSEE", changedBy: u.id, changedAt: at, reason: "Saisi hors ligne" });
      if (op.deposit && sessionId) {
        await tx.insert(payments).values({
          id: op.deposit.paymentId, orderId: op.id, cashSessionId: sessionId, method: op.deposit.method, amount: op.deposit.amount,
          reference: op.deposit.reference, idempotencyKey: op.deposit.paymentId, createdBy: u.id, createdAt: at,
        });
      }
      if (reserved) await tx.update(reservedNumbers).set({ usedAt: new Date(), orderId: op.id }).where(eq(reservedNumbers.number, op.number));
      return { id: op.id, number, total: totals.total, renumbered: number !== op.number };
    }
    case "ADD_PAYMENT": {
      const [o] = await tx.select().from(orders).where(eq(orders.id, op.orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      if (o.status === "ANNULEE") fail("Commande annulée : encaissement impossible.");
      const remaining = o.total - o.amountPaid;
      if (op.amount > remaining) fail(`Montant supérieur au reste à payer (${formatAmount(remaining)} FCFA).`);
      const sessionId = await resolveSession(tx, u.id, op.sessionId);
      await tx.insert(payments).values({
        id: op.paymentId, orderId: o.id, cashSessionId: sessionId, method: op.method, amount: op.amount, reference: op.reference,
        idempotencyKey: op.paymentId, createdBy: u.id, createdAt: at,
      });
      await tx.update(orders).set({ amountPaid: sql`${orders.amountPaid} + ${op.amount}`, updatedAt: at }).where(eq(orders.id, o.id));
      return { paymentId: op.paymentId };
    }
    case "COLLECT_ORDER": {
      const [o] = await tx.select().from(orders).where(eq(orders.id, op.orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      if (o.status === "RETIREE") return { already: true };
      if (o.status === "ANNULEE") fail("Commande annulée.");
      if (o.total - o.amountPaid > 0) fail("Solde impayé : retrait refusé.");
      // Comme en ligne : remettre une commande non prête est réservé au gérant.
      if (o.status !== "PRETE" && u.role !== "ADMIN") fail("Commande non prête : remise réservée au gérant.");
      await tx.update(orders).set({ status: "RETIREE", collectedAt: at, collectedBy: u.id, updatedAt: at, readyAt: o.readyAt ?? at }).where(eq(orders.id, o.id));
      await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: "RETIREE", changedBy: u.id, changedAt: at, reason: o.status !== "PRETE" ? "Retrait hors ligne (commande non marquée prête)" : null });
      return {};
    }
    case "ADD_EXPENSE": {
      const sessionId = await resolveSession(tx, u.id, op.sessionId);
      await tx.insert(expenses).values({ id: op.expenseId, cashSessionId: sessionId, label: op.label, category: op.category, method: op.method, amount: op.amount, createdBy: u.id, createdAt: at });
      return {};
    }
    case "CLOSE_CASH": {
      const sessionId = await resolveSession(tx, u.id, op.sessionId, false);
      const [s] = await tx.select().from(cashSessions).where(eq(cashSessions.id, sessionId)).for("update");
      if (s.status === "FERMEE") return { sessionId, already: true };
      const pays = await tx.select({ method: payments.method, amount: payments.amount, voidedAt: payments.voidedAt }).from(payments).where(eq(payments.cashSessionId, s.id));
      const exps = await tx.select({ method: expenses.method, amount: expenses.amount, voidedAt: expenses.voidedAt }).from(expenses).where(eq(expenses.cashSessionId, s.id));
      const rows = computeCashExpected(s.openingFloat,
        pays.map((p) => ({ method: p.method, amount: p.amount, voided: !!p.voidedAt })), exps.map((e) => ({ method: e.method, amount: e.amount, voided: !!e.voidedAt })));
      await tx.insert(cashSessionCounts).values(METHODS.map((m: Method) => {
        const expected = rows.find((r) => r.method === m)!.expected;
        return { cashSessionId: s.id, method: m, expected, counted: op.counts[m], difference: op.counts[m] - expected };
      }));
      const gap = METHODS.some((m) => op.counts[m] !== rows.find((r) => r.method === m)!.expected);
      const comment = op.comment ? `${op.comment} (clôture hors ligne)` : gap ? "Écart non justifié (clôture hors ligne)" : "Clôture hors ligne";
      await tx.update(cashSessions).set({ status: "FERMEE", closedAt: at, closingComment: comment }).where(eq(cashSessions.id, s.id));
      return { sessionId: s.id };
    }
  }
}

/** Rejoue les opérations dans l'ordre. Chaque opération est atomique et idempotente (op_id). */
export async function syncOps(u: Snapshot["user"], raw: unknown[]): Promise<OpResult[]> {
  const out: OpResult[] = [];
  for (const r of raw) {
    const parsed = opSchema.safeParse(r);
    const opId = (r as { opId?: string })?.opId ?? "";
    if (!parsed.success) { out.push({ opId, ok: false, error: "Opération invalide." }); continue; }
    const op = parsed.data;
    const [done] = await db.select().from(offlineOps).where(and(eq(offlineOps.opId, op.opId), eq(offlineOps.userId, u.id))).limit(1);
    if (done) { out.push({ opId: op.opId, ok: done.ok, error: done.error ?? undefined, data: (done.result as Record<string, unknown>) ?? undefined }); continue; }
    try {
      const data = await db.transaction(async (tx) => {
        const d = await apply(tx, u, op);
        await tx.insert(offlineOps).values({ opId: op.opId, userId: u.id, type: op.type, payload: op as unknown as OfflineOp, ok: true, result: d, occurredAt: when(op.at) });
        return d;
      });
      out.push({ opId: op.opId, ok: true, data });
    } catch (e) {
      const error = e instanceof DomainError ? e.message : pgCode(e) === "23505" ? "Déjà enregistré." : "Erreur serveur.";
      if (!(e instanceof DomainError) && pgCode(e) !== "23505") console.error("[offline sync]", op.type, e);
      await db.insert(offlineOps).values({ opId: op.opId, userId: u.id, type: op.type, payload: op as unknown as OfflineOp, ok: false, error, occurredAt: when(op.at) }).onConflictDoNothing();
      out.push({ opId: op.opId, ok: false, error });
    }
  }
  return out;
}
