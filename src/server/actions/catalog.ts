"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { itemTypes, orderItems, prices, services } from "../db/schema";
import { requireRole } from "../session";
import { fail, pgCode, run } from "../action-utils";

/** Les tarifs sont des multiples de 100 FCFA. */
const priceAmount = z.number().int().min(100, "Prix invalide.").max(10_000_000).refine((v) => v % 100 === 0, "Le prix doit être un multiple de 100 FCFA.");

// Le catalogue alimente le dépôt, les commandes et les tickets : on rafraîchit toute l'application.
const refresh = () => revalidatePath("/", "layout");

function uniqueName(e: unknown): never {
  if (pgCode(e) === "23505") fail("Ce nom existe déjà.");
  throw e;
}

export async function upsertItemType(raw: { id?: string; name: string; isFrequent: boolean; sortOrder: number; active: boolean }) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = z.object({
      id: z.uuid().optional(),
      name: z.string().trim().min(2, "Nom obligatoire.").max(60),
      isFrequent: z.boolean(),
      sortOrder: z.number().int().min(0).max(9999),
      active: z.boolean(),
    }).parse(raw);
    try {
      if (input.id) await db.update(itemTypes).set({ ...input, updatedAt: new Date() }).where(eq(itemTypes.id, input.id));
      else await db.insert(itemTypes).values(input);
    } catch (e) { uniqueName(e); }
    refresh();
    return undefined;
  });
}

export async function upsertService(raw: { id?: string; name: string; shortName: string; active: boolean }) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = z.object({
      id: z.uuid().optional(),
      name: z.string().trim().min(2, "Nom obligatoire.").max(60),
      shortName: z.string().trim().min(1, "Nom court obligatoire.").max(12, "Nom court : 12 caractères max."),
      active: z.boolean(),
    }).parse(raw);
    try {
      if (input.id) await db.update(services).set({ ...input, updatedAt: new Date() }).where(eq(services.id, input.id));
      else await db.insert(services).values(input);
    } catch (e) { uniqueName(e); }
    refresh();
    return undefined;
  });
}

/** F-CAT-03/04 : un montant crée ou réactive le prix ; `null` le désactive (pas de suppression). */
export async function setPrice(raw: { itemTypeId: string; serviceId: string; amount: number | null }) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = z.object({
      itemTypeId: z.uuid(), serviceId: z.uuid(),
      amount: priceAmount.nullable(),
    }).parse(raw);
    const where = and(eq(prices.itemTypeId, input.itemTypeId), eq(prices.serviceId, input.serviceId));
    if (input.amount === null) {
      await db.update(prices).set({ active: false, updatedAt: new Date() }).where(where);
    } else {
      await db.insert(prices).values({ itemTypeId: input.itemTypeId, serviceId: input.serviceId, amount: input.amount })
        .onConflictDoUpdate({ target: [prices.itemTypeId, prices.serviceId], set: { amount: input.amount, active: true, updatedAt: new Date() } });
    }
    refresh();
    return undefined;
  });
}

const itemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Nom obligatoire.").max(60),
  isFrequent: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  active: z.boolean(),
  prices: z.array(z.object({ serviceId: z.uuid(), amount: priceAmount.nullable() })).max(50),
});

/** Crée ou modifie un article avec ses tarifs par service, en une seule transaction. */
export async function saveItem(raw: z.input<typeof itemSchema>) {
  return run(async () => {
    await requireRole("ADMIN");
    const { prices: list, id, ...item } = itemSchema.parse(raw);
    try {
      await db.transaction(async (tx) => {
        let itemId = id;
        if (itemId) await tx.update(itemTypes).set({ ...item, updatedAt: new Date() }).where(eq(itemTypes.id, itemId));
        else [{ id: itemId }] = await tx.insert(itemTypes).values(item).returning({ id: itemTypes.id });
        for (const p of list) {
          const where = and(eq(prices.itemTypeId, itemId!), eq(prices.serviceId, p.serviceId));
          if (p.amount === null) await tx.update(prices).set({ active: false, updatedAt: new Date() }).where(where);
          else await tx.insert(prices).values({ itemTypeId: itemId!, serviceId: p.serviceId, amount: p.amount })
            .onConflictDoUpdate({ target: [prices.itemTypeId, prices.serviceId], set: { amount: p.amount, active: true, updatedAt: new Date() } });
        }
      });
    } catch (e) { uniqueName(e); }
    refresh();
    return undefined;
  });
}

/** Suppression définitive, seulement si l'article n'apparaît dans aucune commande ; sinon on le désactive. */
export async function deleteItemType(raw: { id: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id } = z.object({ id: z.uuid() }).parse(raw);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems).where(eq(orderItems.itemTypeId, id));
    if (n > 0) fail(`Article utilisé dans ${n} ligne(s) de commande : désactivez-le plutôt que de le supprimer.`);
    await db.transaction(async (tx) => {
      await tx.delete(prices).where(eq(prices.itemTypeId, id));
      await tx.delete(itemTypes).where(eq(itemTypes.id, id));
    });
    refresh();
    return undefined;
  });
}

export async function deleteService(raw: { id: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { id } = z.object({ id: z.uuid() }).parse(raw);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orderItems).where(eq(orderItems.serviceId, id));
    if (n > 0) fail(`Service utilisé dans ${n} ligne(s) de commande : désactivez-le plutôt que de le supprimer.`);
    await db.transaction(async (tx) => {
      await tx.delete(prices).where(eq(prices.serviceId, id));
      await tx.delete(services).where(eq(services.id, id));
    });
    refresh();
    return undefined;
  });
}
