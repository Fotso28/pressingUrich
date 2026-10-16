"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { forfaitMoves, forfaits, kiloTypes, orderItems } from "../db/schema";
import { requireRole, requireUser } from "../session";
import { fail, pgCode, run } from "../action-utils";
import { forfaitBalance } from "../orders/lines";

const price = z.number().int().min(100, "Prix invalide.").max(10_000_000).refine((v) => v % 100 === 0, "Le prix doit être un multiple de 100 FCFA.");

const forfaitSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Nom obligatoire.").max(60),
  price,
  grams: z.number().int().min(1000, "Poids minimal : 1 kg.").max(1_000_000),
  active: z.boolean(),
});

/** Crée ou modifie un forfait. Les forfaits déjà vendus gardent leur prix et leur poids. */
export async function saveForfait(raw: z.input<typeof forfaitSchema>) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id, ...f } = forfaitSchema.parse(raw);
    if (id) await db.update(forfaits).set({ ...f, updatedAt: new Date() }).where(eq(forfaits.id, id));
    else await db.insert(forfaits).values(f);
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Suppression seulement si le forfait n'a jamais été vendu ; sinon on le désactive. */
export async function deleteForfait(raw: { id: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id } = z.object({ id: z.uuid() }).parse(raw);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems).where(eq(orderItems.forfaitId, id));
    if (n > 0) fail(`Forfait déjà vendu ${n} fois : désactivez-le plutôt que de le supprimer.`);
    await db.delete(forfaits).where(eq(forfaits.id, id));
    revalidatePath("/", "layout");
    return undefined;
  });
}

const kiloTypeSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Nom obligatoire.").max(60),
  pricePerKg: price,
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
});

/** Crée ou modifie un type de linge au kilo (prix du kilo). Les dépôts déjà faits gardent leur prix. */
export async function saveKiloType(raw: z.input<typeof kiloTypeSchema>) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id, ...k } = kiloTypeSchema.parse(raw);
    try {
      if (id) await db.update(kiloTypes).set({ ...k, updatedAt: new Date() }).where(eq(kiloTypes.id, id));
      else await db.insert(kiloTypes).values(k);
    } catch (e) {
      if (pgCode(e) === "23505") fail("Ce nom existe déjà.");
      throw e;
    }
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Suppression seulement si le type n'a jamais servi ; sinon on le désactive. */
export async function deleteKiloType(raw: { id: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id } = z.object({ id: z.uuid() }).parse(raw);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems).where(eq(orderItems.kiloTypeId, id));
    if (n > 0) fail(`Type déjà utilisé dans ${n} dépôt(s) : désactivez-le plutôt que de le supprimer.`);
    await db.delete(kiloTypes).where(eq(kiloTypes.id, id));
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Solde forfait d'un client (grammes), pour le dépôt. */
export async function getForfaitBalance(raw: { customerId: string }) {
  return run(async () => {
    await requireUser();
    const { customerId } = z.object({ customerId: z.uuid() }).parse(raw);
    return db.transaction((tx) => forfaitBalance(tx, customerId));
  });
}

/** Correction manuelle du solde par le gérant (geste commercial, erreur de pesée…), avec motif. */
export async function adjustForfait(raw: { customerId: string; grams: number; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const input = z.object({ customerId: z.uuid(), grams: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Poids nul."), reason: z.string().trim().min(3, "Motif obligatoire.").max(200) }).parse(raw);
    await db.insert(forfaitMoves).values({ customerId: input.customerId, kind: "AJUSTEMENT", grams: input.grams, label: `Correction : ${input.reason}`, createdBy: user.id });
    revalidatePath("/", "layout");
    return undefined;
  });
}
