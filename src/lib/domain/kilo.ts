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
 * Consommation des forfaits d'un dépôt : le solde du client plus les forfaits achetés dans ce dépôt couvrent
 * le linge au kilo, ligne après ligne ; le reste est facturé au prix du kilo (s'il est fixé).
 */
export function allocateKilo(balanceGrams: number, lines: { kind: LineKind; grams: number }[], kiloPrice: number) {
  let balance = balanceGrams + lines.filter((l) => l.kind === "FORFAIT").reduce((a, l) => a + l.grams, 0);
  const out = lines.map((l) => {
    if (l.kind !== "KILO") return null;
    const covered = Math.max(0, Math.min(l.grams, balance));
    balance -= covered;
    const uncovered = l.grams - covered;
    return { covered, uncovered, price: uncovered > 0 && kiloPrice > 0 ? kiloLinePrice(uncovered, kiloPrice) : 0 };
  });
  return { lines: out, balanceAfter: balance, missing: out.reduce((a, x) => a + (x && kiloPrice <= 0 ? x.uncovered : 0), 0) };
}
