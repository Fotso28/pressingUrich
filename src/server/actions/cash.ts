"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cashSessionCounts, cashSessions, expenses, payments } from "../db/schema";
import { requireRole, requireUser } from "../session";
import { fail, pgCode, run } from "../action-utils";
import { amountSchema, methodSchema, positiveAmount, reasonSchema } from "../validation";
import { computeCashExpected, EXPENSE_CATEGORIES, METHODS, type Method } from "@/lib/domain/cash";

/** F-CAI-04/06 : ouverture avec fond de caisse ; une seule caisse ouverte par agent. */
export async function openCashSession(raw: { openingFloat: number }) {
  return run(async () => {
    const user = await requireUser();
    const { openingFloat } = z.object({ openingFloat: amountSchema }).parse(raw);
    try {
      await db.insert(cashSessions).values({ userId: user.id, openingFloat });
    } catch (e) {
      if (pgCode(e) === "23505") fail("Vous avez déjà une caisse ouverte.");
      throw e;
    }
    revalidatePath("/", "layout");
    return undefined;
  });
}


export async function addExpense(raw: { label: string; category: string; method: Method; amount: number }) {
  return run(async () => {
    const user = await requireUser();
    const input = z.object({
      label: z.string().trim().min(2, "Libellé obligatoire.").max(200),
      category: z.enum(EXPENSE_CATEGORIES, { message: "Catégorie invalide." }),
      method: methodSchema,
      amount: positiveAmount,
    }).parse(raw);
    const [s] = await db.select({ id: cashSessions.id }).from(cashSessions)
      .where(and(eq(cashSessions.userId, user.id), eq(cashSessions.status, "OUVERTE"))).limit(1);
    if (!s) fail("Ouvrez votre caisse avant de saisir une dépense.");
    await db.insert(expenses).values({ ...input, cashSessionId: s.id, createdBy: user.id });
    revalidatePath("/caisse");
    return undefined;
  });
}

export async function voidExpense(raw: { expenseId: string; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const { expenseId, reason } = z.object({ expenseId: z.uuid(), reason: reasonSchema }).parse(raw);
    const [e] = await db.select({ status: cashSessions.status }).from(expenses).innerJoin(cashSessions, eq(cashSessions.id, expenses.cashSessionId)).where(eq(expenses.id, expenseId)).limit(1);
    const note = e?.status === "FERMEE" ? " (annulée après la clôture de caisse)" : "";
    const res = await db.update(expenses).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason + note })
      .where(and(eq(expenses.id, expenseId), isNull(expenses.voidedAt))).returning({ id: expenses.id });
    if (!res.length) fail("Dépense introuvable ou déjà annulée.");
    revalidatePath("/caisse");
    return undefined;
  });
}

/** F-CAI-05 : attendu par mode, compté, écart ; commentaire obligatoire si écart. */
export async function closeCashSession(raw: { counts: Record<Method, number>; comment?: string; sessionId?: string }) {
  return run(async (): Promise<{ sessionId: string }> => {
    const user = await requireUser();
    const input = z.object({
      counts: z.object({ ESPECES: amountSchema, MTN_MOMO: amountSchema, ORANGE_MONEY: amountSchema }),
      comment: z.string().trim().max(1000).optional(),
      sessionId: z.uuid().optional(),
    }).parse(raw);
    const id = await db.transaction(async (tx) => {
      // Sa propre caisse ouverte ; ou, pour le gérant, la caisse d'un agent oubliée ouverte (sessionId).
      const [s] = await tx.select().from(cashSessions)
        .where(input.sessionId
          ? and(eq(cashSessions.id, input.sessionId), eq(cashSessions.status, "OUVERTE"))
          : and(eq(cashSessions.userId, user.id), eq(cashSessions.status, "OUVERTE"))).for("update");
      if (!s) fail("Aucune caisse ouverte.");
      const forOther = s.userId !== user.id;
      if (forOther && user.role !== "ADMIN") fail("Seul le gérant peut clôturer la caisse d'un autre agent.");
      const pays = await tx.select({ method: payments.method, amount: payments.amount, voidedAt: payments.voidedAt })
        .from(payments).where(eq(payments.cashSessionId, s.id));
      const exps = await tx.select({ method: expenses.method, amount: expenses.amount, voidedAt: expenses.voidedAt })
        .from(expenses).where(eq(expenses.cashSessionId, s.id));
      const rows = computeCashExpected(s.openingFloat,
        pays.map((p) => ({ method: p.method, amount: p.amount, voided: !!p.voidedAt })),
        exps.map((e) => ({ method: e.method, amount: e.amount, voided: !!e.voidedAt })));
      const counts = METHODS.map((m) => {
        const expected = rows.find((r) => r.method === m)!.expected;
        const counted = input.counts[m];
        return { cashSessionId: s.id, method: m, expected, counted, difference: counted - expected };
      });
      const hasGap = counts.some((c) => c.difference !== 0);
      if (hasGap && (!input.comment || input.comment.length < 3)) fail("Écart constaté : commentaire obligatoire.");
      await tx.insert(cashSessionCounts).values(counts);
      const note = forOther ? `Clôturée par le gérant (${user.name})` : null;
      const closingComment = [input.comment, note].filter(Boolean).join(" · ") || null;
      await tx.update(cashSessions).set({ status: "FERMEE", closedAt: new Date(), closingComment })
        .where(eq(cashSessions.id, s.id));
      return s.id;
    });
    revalidatePath("/", "layout");
    return { sessionId: id };
  });
}
