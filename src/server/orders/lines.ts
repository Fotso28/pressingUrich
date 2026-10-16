import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { customers, forfaitMoves, forfaits, itemTypes, prices, services } from "../db/schema";
import { fail } from "../action-utils";
import { allocateKilo, formatKg } from "@/lib/domain/kilo";

const txt = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));
const short = z.string().trim().max(120).nullish().transform((v) => (v ? v : null));

const pieceLine = z.object({
  kind: z.literal("PIECE"),
  itemTypeId: z.uuid(),
  serviceId: z.uuid(),
  quantity: z.number().int().min(1, "Quantité minimale : 1.").max(999),
  /** Prix choisi pour un article à prix variable (sinon ignoré). */
  unitPrice: z.number().int().min(0).max(10_000_000).nullish(),
  description: short,
  color: txt,
  brand: txt,
  observations: txt,
});
const kiloLine = z.object({
  kind: z.literal("KILO"),
  grams: z.number().int().min(100, "Poids minimal : 0,1 kg.").max(500_000, "Poids trop élevé."),
  description: short,
  observations: txt,
});
const forfaitLine = z.object({ kind: z.literal("FORFAIT"), forfaitId: z.uuid() });

/** Ligne de dépôt ; sans `kind`, c'est un article à la pièce (anciennes saisies hors ligne). */
export const orderLineSchema = z.preprocess(
  (v) => (v && typeof v === "object" && !("kind" in v) ? { ...v, kind: "PIECE" } : v),
  z.discriminatedUnion("kind", [pieceLine, kiloLine, forfaitLine]),
);
export type OrderLineInput = z.input<typeof pieceLine> | z.input<typeof kiloLine> | z.input<typeof forfaitLine>;
type Parsed = z.infer<typeof pieceLine> | z.infer<typeof kiloLine> | z.infer<typeof forfaitLine>;

export type ResolvedLine = {
  lineNo: number; kind: "PIECE" | "KILO" | "FORFAIT";
  itemTypeId: string | null; serviceId: string | null; forfaitId: string | null; weightGrams: number | null;
  itemLabel: string; serviceLabel: string; unitPrice: number; quantity: number; lineTotal: number;
  description: string | null; color: string | null; brand: string | null; observations: string | null;
  /** Exclu de la majoration express (achat de forfait). */
  noSurcharge: boolean;
};

/** Solde forfait d'un client, en grammes. */
export async function forfaitBalance(tx: Tx, customerId: string): Promise<number> {
  const [r] = await tx.select({ g: sql<number>`coalesce(sum(${forfaitMoves.grams}),0)::int` }).from(forfaitMoves).where(eq(forfaitMoves.customerId, customerId));
  return Number(r?.g ?? 0);
}

/**
 * Prix et libellés des lignes d'un dépôt, à partir du catalogue, des forfaits et du solde du client.
 * Renvoie aussi les mouvements de forfait à enregistrer (achats, consommation).
 */
export async function resolveLines(tx: Tx, customerId: string, raw: Parsed[], kiloPrice: number) {
  const pieces = raw.filter((l): l is z.infer<typeof pieceLine> => l.kind === "PIECE");
  const pairs = pieces.length ? await tx.select({
    itemTypeId: prices.itemTypeId, serviceId: prices.serviceId, amount: prices.amount, maxAmount: prices.maxAmount,
    itemLabel: itemTypes.name, serviceLabel: services.shortName,
  }).from(prices).innerJoin(itemTypes, eq(itemTypes.id, prices.itemTypeId)).innerJoin(services, eq(services.id, prices.serviceId))
    .where(and(eq(prices.active, true), eq(itemTypes.active, true), eq(services.active, true), inArray(prices.itemTypeId, pieces.map((l) => l.itemTypeId)))) : [];
  const fIds = raw.flatMap((l) => (l.kind === "FORFAIT" ? [l.forfaitId] : []));
  const fs = fIds.length ? await tx.select().from(forfaits).where(and(inArray(forfaits.id, fIds), eq(forfaits.active, true))) : [];
  const hasKilo = raw.some((l) => l.kind !== "PIECE");
  // Verrou sur le client : deux dépôts simultanés ne consomment pas deux fois le même solde.
  if (hasKilo) await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).for("update");
  const balance = hasKilo ? await forfaitBalance(tx, customerId) : 0;
  const alloc = allocateKilo(balance, raw.map((l) => ({
    kind: l.kind, grams: l.kind === "KILO" ? l.grams : l.kind === "FORFAIT" ? (fs.find((f) => f.id === l.forfaitId)?.grams ?? 0) : 0,
  })), kiloPrice);
  if (alloc.missing > 0) fail(`Solde forfait insuffisant : il manque ${formatKg(alloc.missing)}. Ajoutez un forfait au dépôt.`);

  const lines: ResolvedLine[] = raw.map((l, i) => {
    const base = { lineNo: i + 1, description: null, color: null, brand: null, observations: null, itemTypeId: null, serviceId: null, forfaitId: null, weightGrams: null, noSurcharge: false };
    if (l.kind === "PIECE") {
      const p = pairs.find((x) => x.itemTypeId === l.itemTypeId && x.serviceId === l.serviceId);
      if (!p) fail(`Ligne ${i + 1} : cette combinaison article × service n'a pas de prix.`);
      let unitPrice = p.amount;
      if (p.maxAmount != null && l.unitPrice != null) {
        if (l.unitPrice < p.amount || l.unitPrice > p.maxAmount || l.unitPrice % 100 !== 0) fail(`Ligne ${i + 1} : le prix de « ${p.itemLabel} » doit être entre ${p.amount} et ${p.maxAmount} FCFA (multiple de 100).`);
        unitPrice = l.unitPrice;
      }
      return { ...base, kind: "PIECE", itemTypeId: l.itemTypeId, serviceId: l.serviceId, itemLabel: p.itemLabel, serviceLabel: p.serviceLabel,
        unitPrice, quantity: l.quantity, lineTotal: unitPrice * l.quantity, description: l.description, color: l.color, brand: l.brand, observations: l.observations };
    }
    if (l.kind === "FORFAIT") {
      const f = fs.find((x) => x.id === l.forfaitId) ?? fail(`Ligne ${i + 1} : forfait indisponible.`);
      return { ...base, kind: "FORFAIT", forfaitId: f.id, weightGrams: f.grams, itemLabel: f.name, serviceLabel: "Forfait",
        unitPrice: f.price, quantity: 1, lineTotal: f.price, noSurcharge: true };
    }
    const a = alloc.lines[i]!;
    return { ...base, kind: "KILO", weightGrams: l.grams, itemLabel: "Linge au kilo", serviceLabel: a.uncovered > 0 ? "Au kilo" : "Forfait",
      unitPrice: a.price, quantity: 1, lineTotal: a.price, description: l.description, observations: l.observations };
  });

  const moves = [
    ...lines.filter((l) => l.kind === "FORFAIT").map((l) => ({ kind: "ACHAT", grams: l.weightGrams!, label: `Achat ${l.itemLabel}` })),
    ...lines.flatMap((l, i) => (l.kind === "KILO" && alloc.lines[i]!.covered > 0 ? [{ kind: "CONSO", grams: -alloc.lines[i]!.covered, label: `Linge au kilo (${formatKg(l.weightGrams!)})` }] : [])),
  ];
  return { lines, moves, onlyForfaits: lines.every((l) => l.kind === "FORFAIT") };
}

/** Enregistre les mouvements de forfait d'une commande. */
export async function recordMoves(tx: Tx, customerId: string, orderId: string, userId: string, moves: { kind: string; grams: number; label: string }[], at?: Date) {
  if (!moves.length) return;
  await tx.insert(forfaitMoves).values(moves.map((m) => ({ customerId, orderId, createdBy: userId, ...m, ...(at ? { createdAt: at } : {}) })));
}

/** Annulation d'une commande : on rend au client le solde consommé (et on retire les forfaits achetés). */
export async function reverseMoves(tx: Tx, orderId: string, userId: string, number: number) {
  const rows = await tx.select({ customerId: forfaitMoves.customerId, g: sql<number>`sum(${forfaitMoves.grams})::int` }).from(forfaitMoves)
    .where(eq(forfaitMoves.orderId, orderId)).groupBy(forfaitMoves.customerId);
  for (const r of rows) {
    if (Number(r.g) !== 0) await tx.insert(forfaitMoves).values({ customerId: r.customerId, orderId, kind: "ANNULATION", grams: -Number(r.g), label: `Annulation de la commande N° ${number}`, createdBy: userId });
  }
}

/** Lignes prêtes à insérer dans order_items. */
export const itemRows = (orderId: string, lines: ResolvedLine[]) => lines.map(({ noSurcharge, ...l }) => { void noSurcharge; return { orderId, ...l }; });
