"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { formatAmount } from "@/lib/domain/money";
import { db, type Tx } from "../db";
import { cashSessions, orderItems, orderStatusHistory, orders, payments } from "../db/schema";
import { requireRole, requireUser, type CurrentUser } from "../session";
import { fail, pgCode, run } from "../action-utils";
import { methodSchema, optText, positiveAmount, reasonSchema } from "../validation";
import { getSettings } from "../queries/settings";
import { computeOrderTotals, type DiscountInput } from "@/lib/domain/totals";
import { computeDueAt } from "@/lib/domain/dates";
import { itemRows, orderLineSchema, type OrderLineInput, recordMoves, resolveLines, reverseMoves } from "../orders/lines";
import { canCancel, nextWorkshopStatus, previousStatus, type OrderStatus } from "@/lib/domain/status";

const discountSchema = z.object({
  type: z.enum(["MONTANT", "POURCENT"]),
  value: z.number().int().min(0, "Remise invalide.").max(100_000_000, "Remise invalide."),
}).nullable();

const createOrderSchema = z.object({
  idempotencyKey: z.uuid(),
  customerId: z.uuid({ message: "Choisissez un client." }),
  lines: z.array(orderLineSchema).min(1, "Ajoutez au moins un article.").max(100, "100 lignes maximum."),
  isExpress: z.boolean(),
  dueAt: z.iso.datetime().nullable(),
  discount: discountSchema,
  notes: optText,
  deposit: z.object({
    idempotencyKey: z.uuid(),
    amount: positiveAmount,
    method: methodSchema,
    reference: optText,
  }).nullable(),
});

export type CreateOrderInput = Omit<z.input<typeof createOrderSchema>, "lines"> & { lines: OrderLineInput[] };

function checkDiscount(user: CurrentUser, discountPct: number, maxPct: number) {
  // F-DEP-06 : au-delà du plafond, la remise est réservée au gérant.
  if (user.role !== "ADMIN" && discountPct > maxPct + 1e-9) fail(`Remise supérieure à ${maxPct} % : réservée au gérant.`);
}

async function openSessionOf(tx: Tx, userId: string) {
  const [s] = await tx.select({ id: cashSessions.id }).from(cashSessions)
    .where(and(eq(cashSessions.userId, userId), eq(cashSessions.status, "OUVERTE"))).limit(1);
  return s ?? null;
}

/** F-DEP-01 à 08 : enregistrement atomique et idempotent d'un dépôt (RG-03, RG-04, RG-08). */
export async function createOrder(raw: CreateOrderInput) {
  return run(async (): Promise<{ id: string; number: number }> => {
    const user = await requireUser();
    const input = createOrderSchema.parse(raw);

    const [existing] = await db.select({ id: orders.id, number: orders.number }).from(orders)
      .where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return existing;

    const settings = await getSettings();
    const now = new Date();
    const dueAt = input.dueAt ? new Date(input.dueAt)
      : computeDueAt(now, { isExpress: input.isExpress, standardHours: settings.standardDelayHours, expressHours: settings.expressDelayHours });

    try {
      const created = await db.transaction(async (tx) => {
        const { lines, moves, onlyForfaits } = await resolveLines(tx, input.customerId, input.lines);
        const expressRatePct = input.isExpress ? settings.expressRatePct : 0;
        const totals = computeOrderTotals(lines, { isExpress: input.isExpress, expressRatePct, discount: input.discount as DiscountInput });
        checkDiscount(user, totals.discountPct, settings.agentMaxDiscountPct);
        if (input.deposit && input.deposit.amount > totals.total) fail("L'acompte dépasse le total (RG-12).");
        // Vente de forfait seule : rien à traiter à l'atelier, elle se règle tout de suite et se clôt aussitôt.
        if (onlyForfaits && (input.deposit?.amount ?? 0) < totals.total) fail("Un forfait se règle à l'achat : encaissez la totalité.");
        let sessionId: string | null = null;
        if (input.deposit) {
          const s = await openSessionOf(tx, user.id);
          if (!s) fail("Ouvrez votre caisse avant d'encaisser un acompte.");
          sessionId = s.id;
        }
        const [o] = await tx.insert(orders).values({
          customerId: input.customerId,
          isExpress: input.isExpress,
          expressRatePct,
          subtotal: totals.subtotal,
          expressAmount: totals.expressAmount,
          discountType: input.discount && input.discount.value > 0 ? input.discount.type : null,
          discountValue: input.discount?.value ?? 0,
          discountAmount: totals.discountAmount,
          total: totals.total,
          amountPaid: input.deposit?.amount ?? 0,
          dueAt,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          createdBy: user.id,
          ...(onlyForfaits ? { status: "RETIREE" as const, readyAt: now, collectedAt: now, collectedBy: user.id } : {}),
        }).returning({ id: orders.id, number: orders.number });
        await tx.insert(orderItems).values(itemRows(o.id, lines));
        await recordMoves(tx, input.customerId, o.id, user.id, moves);
        await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: null, toStatus: "DEPOSEE", changedBy: user.id });
        if (onlyForfaits) await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: "DEPOSEE", toStatus: "RETIREE", changedBy: user.id, reason: "Vente de forfait" });
        if (input.deposit && sessionId) {
          await tx.insert(payments).values({
            orderId: o.id, cashSessionId: sessionId, method: input.deposit.method, amount: input.deposit.amount,
            reference: input.deposit.reference, idempotencyKey: input.deposit.idempotencyKey, createdBy: user.id,
          });
        }
        return o;
      });
      revalidatePath("/", "layout");
      return created;
    } catch (e) {
      // Double soumission concurrente : la contrainte unique a joué, on renvoie l'existant.
      if (pgCode(e) === "23505") {
        const [o] = await db.select({ id: orders.id, number: orders.number }).from(orders)
          .where(eq(orders.idempotencyKey, input.idempotencyKey)).limit(1);
        if (o) return o;
      }
      throw e;
    }
  });
}

const updateOrderSchema = z.object({
  orderId: z.uuid(),
  isExpress: z.boolean(),
  dueAt: z.iso.datetime(),
  discount: discountSchema,
  notes: optText,
  lines: z.array(z.object({
    id: z.uuid(),
    quantity: z.number().int().min(1).max(999),
    description: optText,
    color: optText,
    brand: optText,
    observations: optText,
  })),
});

/** RG-06 : un agent modifie une commande DÉPOSÉE ; ensuite seul le gérant, avec trace. */
export async function updateOrder(raw: z.input<typeof updateOrderSchema>) {
  return run(async () => {
    const user = await requireUser();
    const input = updateOrderSchema.parse(raw);
    const settings = await getSettings();
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      if (o.status === "ANNULEE" || o.status === "RETIREE") fail("Cette commande n'est plus modifiable.");
      if (o.status !== "DEPOSEE" && user.role !== "ADMIN") fail("Commande déjà en traitement : modification réservée au gérant.");
      const current = await tx.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      const lines = current.map((l) => {
        const u = input.lines.find((x) => x.id === l.id);
        // Le poids et les forfaits ne se modifient pas ici (ils ont déjà joué sur le solde du client).
        return u ? { ...l, quantity: l.kind === "PIECE" ? u.quantity : l.quantity, description: u.description, color: u.color, brand: u.brand, observations: u.observations } : l;
      }).map((l) => ({ ...l, noSurcharge: l.kind === "FORFAIT" }));
      // Le taux express déjà figé est conservé ; sinon on prend le taux courant.
      const expressRatePct = input.isExpress ? (o.isExpress ? o.expressRatePct : settings.expressRatePct) : 0;
      const totals = computeOrderTotals(lines, { isExpress: input.isExpress, expressRatePct, discount: input.discount as DiscountInput });
      checkDiscount(user, totals.discountPct, settings.agentMaxDiscountPct);
      if (totals.total < o.amountPaid) fail("Le nouveau total serait inférieur au montant déjà payé.");
      for (const l of lines) {
        await tx.update(orderItems).set({
          quantity: l.quantity, lineTotal: l.unitPrice * l.quantity, description: l.description, color: l.color, brand: l.brand, observations: l.observations,
        }).where(eq(orderItems.id, l.id));
      }
      await tx.update(orders).set({
        isExpress: input.isExpress, expressRatePct, subtotal: totals.subtotal, expressAmount: totals.expressAmount,
        discountType: input.discount && input.discount.value > 0 ? input.discount.type : null,
        discountValue: input.discount?.value ?? 0, discountAmount: totals.discountAmount, total: totals.total,
        dueAt: new Date(input.dueAt), notes: input.notes, updatedAt: new Date(),
      }).where(eq(orders.id, o.id));
      await tx.insert(orderStatusHistory).values({
        orderId: o.id, fromStatus: o.status, toStatus: o.status, changedBy: user.id,
        reason: `Modification (total ${formatAmount(o.total)} → ${formatAmount(totals.total)} FCFA)`,
      });
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** F-ATL-02 : étape suivante, une ou plusieurs commandes. */
export async function advanceOrderStatus(orderIds: string[]) {
  return run(async (): Promise<{ advanced: number; skipped: number }> => {
    const user = await requireUser();
    const ids = z.array(z.uuid()).min(1, "Aucune commande sélectionnée.").max(200).parse(orderIds);
    let advanced = 0;
    await db.transaction(async (tx) => {
      const rows = await tx.select({ id: orders.id, status: orders.status }).from(orders)
        .where(inArray(orders.id, ids)).for("update");
      const now = new Date();
      for (const r of rows) {
        const next = nextWorkshopStatus(r.status);
        if (!next) continue;
        await tx.update(orders).set({ status: next, updatedAt: now, ...(next === "PRETE" ? { readyAt: now } : {}) })
          .where(eq(orders.id, r.id));
        await tx.insert(orderStatusHistory).values({ orderId: r.id, fromStatus: r.status, toStatus: next, changedBy: user.id });
        advanced++;
      }
    });
    revalidatePath("/", "layout");
    return { advanced, skipped: ids.length - advanced };
  });
}

/** RG-01 : retour à l'étape précédente, réservé au gérant, avec motif. */
export async function revertOrderStatus(raw: { orderId: string; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const { orderId, reason } = z.object({ orderId: z.uuid(), reason: reasonSchema }).parse(raw);
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      const prev = previousStatus(o.status);
      if (!prev || o.status === "ANNULEE") fail("Aucun retour possible depuis ce statut.");
      await tx.update(orders).set({
        status: prev, updatedAt: new Date(),
        ...(o.status === "PRETE" ? { readyAt: null } : {}),
        ...(o.status === "RETIREE" ? { collectedAt: null, collectedBy: null } : {}),
      }).where(eq(orders.id, o.id));
      await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: prev, reason, changedBy: user.id });
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** F-RET-03/04 : remise au client. Solde impayé ou commande non prête : gérant uniquement, avec motif. */
export async function collectOrder(raw: { orderId: string; reason?: string }) {
  return run(async () => {
    const user = await requireUser();
    const { orderId, reason } = z.object({ orderId: z.uuid(), reason: z.string().trim().max(500).optional() }).parse(raw);
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      if (o.status === "RETIREE") fail("Commande déjà retirée.");
      if (o.status === "ANNULEE") fail("Commande annulée.");
      const forcedReasons: string[] = [];
      if (o.status !== "PRETE") forcedReasons.push("commande non prête");
      if (o.total - o.amountPaid > 0) forcedReasons.push("solde impayé");
      if (forcedReasons.length) {
        if (user.role !== "ADMIN") fail(o.status !== "PRETE" ? "La commande n'est pas prête." : "Encaissez le solde avant la remise au client.");
        if (!reason || reason.length < 3) fail(`Motif obligatoire (${forcedReasons.join(", ")}).`);
      }
      const now = new Date();
      await tx.update(orders).set({ status: "RETIREE", collectedAt: now, collectedBy: user.id, updatedAt: now })
        .where(eq(orders.id, o.id));
      await tx.insert(orderStatusHistory).values({
        orderId: o.id, fromStatus: o.status, toStatus: "RETIREE", changedBy: user.id,
        reason: forcedReasons.length ? `Retrait forcé (${forcedReasons.join(", ")}) : ${reason}` : null,
      });
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function cancelOrder(raw: { orderId: string; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const { orderId, reason } = z.object({ orderId: z.uuid(), reason: reasonSchema }).parse(raw);
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) fail("Commande introuvable.");
      if (!canCancel(o.status as OrderStatus)) fail("Seule une commande déposée ou en traitement peut être annulée.");
      // Sinon l'acompte resterait compté dans le chiffre d'affaires et la caisse.
      if (o.amountPaid > 0) fail("Des paiements ont été encaissés sur cette commande : annulez-les d'abord (et remboursez le client), puis annulez la commande.");
      const now = new Date();
      await tx.update(orders).set({ status: "ANNULEE", cancelledAt: now, cancelledBy: user.id, cancelReason: reason, updatedAt: now })
        .where(eq(orders.id, o.id));
      await tx.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: "ANNULEE", reason, changedBy: user.id });
      await reverseMoves(tx, o.id, user.id, o.number);
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}
