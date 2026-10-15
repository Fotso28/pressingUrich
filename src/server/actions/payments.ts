"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cashSessions, orders, payments } from "../db/schema";
import { requireRole, requireUser } from "../session";
import { fail, pgCode, run } from "../action-utils";
import { methodSchema, optText, positiveAmount, reasonSchema } from "../validation";

const addPaymentSchema = z.object({
  orderId: z.uuid(),
  amount: positiveAmount,
  method: methodSchema,
  reference: optText,
  idempotencyKey: z.uuid(),
});

/** F-CAI-01/02, RG-08/09/12 : encaissement idempotent, plafonné au reste à payer, sur la caisse ouverte. */
export async function addPayment(raw: z.input<typeof addPaymentSchema>) {
  return run(async (): Promise<{ id: string }> => {
    const user = await requireUser();
    const input = addPaymentSchema.parse(raw);
    const [dup] = await db.select({ id: payments.id }).from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
    if (dup) return dup;
    try {
      const p = await db.transaction(async (tx) => {
        const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
        if (!o) fail("Commande introuvable.");
        if (o.status === "ANNULEE") fail("Commande annulée : encaissement impossible.");
        const remaining = o.total - o.amountPaid;
        if (remaining <= 0) fail("Cette commande est déjà soldée.");
        if (input.amount > remaining) fail(`Montant supérieur au reste à payer (${remaining} FCFA).`);
        const [s] = await tx.select({ id: cashSessions.id }).from(cashSessions)
          .where(and(eq(cashSessions.userId, user.id), eq(cashSessions.status, "OUVERTE"))).limit(1);
        if (!s) fail("Ouvrez votre caisse avant d'encaisser.");
        const [row] = await tx.insert(payments).values({
          orderId: o.id, cashSessionId: s.id, method: input.method, amount: input.amount,
          reference: input.reference, idempotencyKey: input.idempotencyKey, createdBy: user.id,
        }).returning({ id: payments.id });
        await tx.update(orders).set({ amountPaid: sql`${orders.amountPaid} + ${input.amount}`, updatedAt: new Date() })
          .where(eq(orders.id, o.id));
        return row;
      });
      revalidatePath("/", "layout");
      return p;
    } catch (e) {
      if (pgCode(e) === "23505") {
        const [p] = await db.select({ id: payments.id }).from(payments).where(eq(payments.idempotencyKey, input.idempotencyKey)).limit(1);
        if (p) return p;
      }
      throw e;
    }
  });
}

/** RG-07 : un paiement erroné est annulé (gérant, motif) et reste visible. */
export async function voidPayment(raw: { paymentId: string; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const { paymentId, reason } = z.object({ paymentId: z.uuid(), reason: reasonSchema }).parse(raw);
    await db.transaction(async (tx) => {
      const [p] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), isNull(payments.voidedAt))).for("update");
      if (!p) fail("Paiement introuvable ou déjà annulé.");
      await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, p.orderId)).for("update");
      await tx.update(payments).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason }).where(eq(payments.id, p.id));
      await tx.update(orders).set({ amountPaid: sql`${orders.amountPaid} - ${p.amount}`, updatedAt: new Date() })
        .where(eq(orders.id, p.orderId));
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}
