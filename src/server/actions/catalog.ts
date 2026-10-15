"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { itemTypes, prices, services } from "../db/schema";
import { requireRole } from "../session";
import { fail, pgCode, run } from "../action-utils";

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
    revalidatePath("/parametres/catalogue");
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
    revalidatePath("/parametres/catalogue");
    return undefined;
  });
}

/** F-CAT-03/04 : un montant crée ou réactive le prix ; `null` le désactive (pas de suppression). */
export async function setPrice(raw: { itemTypeId: string; serviceId: string; amount: number | null }) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = z.object({
      itemTypeId: z.uuid(), serviceId: z.uuid(),
      amount: z.number().int().min(0, "Prix invalide.").max(10_000_000).nullable(),
    }).parse(raw);
    const where = and(eq(prices.itemTypeId, input.itemTypeId), eq(prices.serviceId, input.serviceId));
    if (input.amount === null) {
      await db.update(prices).set({ active: false, updatedAt: new Date() }).where(where);
    } else {
      await db.insert(prices).values({ itemTypeId: input.itemTypeId, serviceId: input.serviceId, amount: input.amount })
        .onConflictDoUpdate({ target: [prices.itemTypeId, prices.serviceId], set: { amount: input.amount, active: true, updatedAt: new Date() } });
    }
    revalidatePath("/parametres/catalogue");
    return undefined;
  });
}
