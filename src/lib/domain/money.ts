const NBSP = " "; // espace fine insécable, séparateur de milliers

/** 12500 → « 12 500 » */
export function formatAmount(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return neg ? `−${s}` : s;
}

/** 12500 → « 12 500 FCFA » */
export function formatFCFA(n: number): string {
  return `${formatAmount(n)} FCFA`;
}

/** Lit un montant saisi (« 12 500 », « 12500 ») en entier FCFA ; NaN si invalide. */
export function parseAmount(input: string): number {
  const digits = input.replace(/[\s  .]/g, "");
  if (!/^-?\d+$/.test(digits)) return NaN;
  return parseInt(digits, 10);
}
