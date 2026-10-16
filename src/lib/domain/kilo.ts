/** Poids en grammes → « 4,5 kg ». */
export function formatKg(grams: number): string {
  const kg = Math.round(grams / 100) / 10;
  return `${kg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} kg`;
}

/** Saisie « 4,5 » ou « 4.5 » (kg) → grammes, au 100 g près. Null si invalide. */
export function parseKg(v: string): number | null {
  const n = Number(v.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) * 100;
}

/** Prix du linge au kilo hors forfait, arrondi à la centaine supérieure. */
export const kiloLinePrice = (grams: number, kiloPrice: number) => Math.ceil((grams / 1000) * kiloPrice / 100) * 100;

export type LineKind = "PIECE" | "KILO" | "FORFAIT";

/**
 * Linge au kilo : chaque ligne est pesée et facturée au prix du kilo de son type de linge.
 * Si le client a un solde forfait (ou en achète un dans ce dépôt), les kilos en sont déduits d'abord
 * (lignes avec `useForfait`), et seul le reste est facturé.
 */
export function allocateKilo(balanceGrams: number, lines: { kind: LineKind; grams: number; pricePerKg?: number; useForfait?: boolean }[]) {
  let balance = Math.max(0, balanceGrams) + lines.filter((l) => l.kind === "FORFAIT").reduce((a, l) => a + l.grams, 0);
  const out = lines.map((l) => {
    if (l.kind !== "KILO") return null;
    const covered = l.useForfait === false ? 0 : Math.max(0, Math.min(l.grams, balance));
    balance -= covered;
    const uncovered = l.grams - covered;
    return { covered, uncovered, price: uncovered > 0 ? kiloLinePrice(uncovered, l.pricePerKg ?? 0) : 0 };
  });
  return { lines: out, balanceAfter: balance };
}
