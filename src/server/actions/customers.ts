"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { customers } from "../db/schema";
import { requireUser } from "../session";
import { fail, run } from "../action-utils";
import { optText } from "../validation";
import { isValidPhone, normalizeName, normalizePhone } from "@/lib/domain/normalize";
import { searchCustomers, findCustomersByPhone, searchOrders, type CustomerHit, type OrderHit } from "../queries/search";

const customerInput = z.object({
  fullName: z.string().trim().min(2, "Nom obligatoire."),
  phone: z.string().trim().refine(isValidPhone, "Téléphone invalide (9 chiffres attendus)."),
  address: optText,
  notes: optText,
});

export type NewCustomer = { id: string; fullName: string; phone: string };

/** F-CLI-05/06 : création rapide ; renvoie les clients ayant déjà ce numéro sauf si `force`. */
export async function createCustomer(raw: z.input<typeof customerInput> & { force?: boolean }) {
  return run(async (): Promise<{ created: NewCustomer | null; duplicates: CustomerHit[] }> => {
    await requireUser();
    const input = customerInput.parse(raw);
    const phoneNormalized = normalizePhone(input.phone);
    if (!raw.force) {
      const duplicates = await findCustomersByPhone(phoneNormalized);
      if (duplicates.length) return { created: null, duplicates };
    }
    const [c] = await db.insert(customers).values({
      ...input, searchName: normalizeName(input.fullName), phoneNormalized,
    }).returning({ id: customers.id, fullName: customers.fullName, phone: customers.phone });
    revalidatePath("/clients");
    return { created: c, duplicates: [] };
  });
}

export async function updateCustomer(raw: z.input<typeof customerInput> & { id: string }) {
  return run(async () => {
    await requireUser();
    const id = z.uuid().parse(raw.id);
    const input = customerInput.parse(raw);
    const res = await db.update(customers).set({
      ...input, searchName: normalizeName(input.fullName), phoneNormalized: normalizePhone(input.phone), updatedAt: new Date(),
    }).where(eq(customers.id, id)).returning({ id: customers.id });
    if (!res.length) fail("Client introuvable.");
    revalidatePath(`/clients/${id}`);
    return undefined;
  });
}

export async function searchCustomersAction(q: string) {
  return run(async () => {
    await requireUser();
    return searchCustomers(q);
  });
}

/** Recherche globale (raccourci « / ») : commandes et clients. */
export async function globalSearch(q: string) {
  return run(async (): Promise<{ orders: OrderHit[]; customers: CustomerHit[] }> => {
    await requireUser();
    const [o, c] = await Promise.all([searchOrders(q), searchCustomers(q)]);
    return { orders: o, customers: c };
  });
}
