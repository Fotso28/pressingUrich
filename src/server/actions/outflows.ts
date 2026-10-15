"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { outflows } from "../db/schema";
import { requireRole } from "../session";
import { fail, run } from "../action-utils";
import { optText, positiveAmount, reasonSchema } from "../validation";
import { OUTFLOW_CATEGORIES, OUTFLOW_METHODS } from "@/lib/domain/cash";

const schema = z.object({
  occurredAt: z.iso.datetime({ message: "Date invalide." }),
  category: z.enum(OUTFLOW_CATEGORIES as [string, ...string[]], { message: "Catégorie invalide." }),
  label: z.string().trim().min(2, "Libellé obligatoire.").max(200),
  amount: positiveAmount,
  method: z.enum(OUTFLOW_METHODS as [string, ...string[]], { message: "Mode de paiement invalide." }),
  beneficiary: optText,
  salaryPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Mois de salaire invalide.").nullable().optional(),
  notes: optText,
});

/** Sortie d'argent hors caisse : achat d'intrants, salaire, loyer, énergie… (gérant). */
export async function addOutflow(raw: z.input<typeof schema>) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const input = schema.parse(raw);
    if (input.category === "SALAIRES") {
      if (!input.beneficiary) fail("Indiquez l'employé payé.");
      if (!input.salaryPeriod) fail("Indiquez le mois de salaire.");
    }
    const when = new Date(input.occurredAt);
    if (when.getTime() > Date.now() + 86_400_000) fail("La date ne peut pas être dans le futur.");
    await db.insert(outflows).values({
      ...input,
      category: input.category as (typeof outflows.$inferInsert)["category"],
      method: input.method as (typeof outflows.$inferInsert)["method"],
      salaryPeriod: input.category === "SALAIRES" ? input.salaryPeriod ?? null : null,
      occurredAt: when,
      createdBy: user.id,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function voidOutflow(raw: { id: string; reason: string }) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const { id, reason } = z.object({ id: z.uuid(), reason: reasonSchema }).parse(raw);
    const res = await db.update(outflows).set({ voidedAt: new Date(), voidedBy: user.id, voidReason: reason })
      .where(and(eq(outflows.id, id), isNull(outflows.voidedAt))).returning({ id: outflows.id });
    if (!res.length) fail("Sortie introuvable ou déjà annulée.");
    revalidatePath("/", "layout");
    return undefined;
  });
}
