"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { outflows, user as users } from "../db/schema";
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
  beneficiaryUserId: z.string().min(1).nullable().optional(),
  salaryPeriod: z.string().regex(/^\d{4}-\d{2}$/, "Mois de salaire invalide.").nullable().optional(),
  notes: optText,
});

/** Valide une sortie et résout l'employé payé (salaire) : nom figé au moment du paiement. */
async function prepare(raw: z.input<typeof schema>) {
  const input = schema.parse(raw);
  let beneficiary = input.beneficiary;
  let beneficiaryUserId: string | null = null;
  if (input.category === "SALAIRES") {
    if (!input.beneficiaryUserId) fail("Choisissez l'employé payé.");
    if (!input.salaryPeriod) fail("Indiquez le mois de salaire.");
    const [employee] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.beneficiaryUserId!)).limit(1);
    if (!employee) fail("Employé introuvable.");
    beneficiary = employee.name;
    beneficiaryUserId = employee.id;
  }
  const when = new Date(input.occurredAt);
  if (when.getTime() > Date.now() + 86_400_000) fail("La date ne peut pas être dans le futur.");
  return {
    ...input,
    beneficiary,
    beneficiaryUserId,
    label: input.category === "SALAIRES" ? `Salaire ${beneficiary}` : input.label,
    category: input.category as (typeof outflows.$inferInsert)["category"],
    method: input.method as (typeof outflows.$inferInsert)["method"],
    salaryPeriod: input.category === "SALAIRES" ? input.salaryPeriod ?? null : null,
    occurredAt: when,
  };
}

/** Sortie d'argent hors caisse : achat d'intrants, salaire, loyer, énergie… (gérant). */
export async function addOutflow(raw: z.input<typeof schema>) {
  return run(async () => {
    const user = await requireRole("ADMIN");
    const values = await prepare(raw);
    await db.insert(outflows).values({ ...values, createdBy: user.id });
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Modification d'une sortie (montant, date, mode, employé, mois…) ; une sortie annulée ne se modifie plus. */
export async function updateOutflow(raw: z.input<typeof schema> & { id: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const id = z.uuid().parse(raw.id);
    const values = await prepare(raw);
    const res = await db.update(outflows).set(values).where(and(eq(outflows.id, id), isNull(outflows.voidedAt))).returning({ id: outflows.id });
    if (!res.length) fail("Sortie introuvable ou annulée.");
    revalidatePath("/", "layout");
    return undefined;
  });
}

/** Salaire mensuel de base d'un employé : défini, modifié ou supprimé (null). Prérempli à chaque paiement. */
export async function setMonthlySalary(raw: { userId: string; amount: number | null }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { userId, amount } = z.object({
      userId: z.string().min(1),
      amount: z.number().int().min(100, "Salaire invalide.").max(100_000_000).refine((v) => v % 100 === 0, "Le salaire doit être un multiple de 100 FCFA.").nullable(),
    }).parse(raw);
    const res = await db.update(users).set({ monthlySalary: amount, updatedAt: new Date() }).where(eq(users.id, userId)).returning({ id: users.id });
    if (!res.length) fail("Employé introuvable.");
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
