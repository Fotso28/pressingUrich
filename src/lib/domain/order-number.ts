/** RG-05 : numéro affiché sur 6 chiffres. */
export function formatOrderNumber(n: number): string {
  return n.toString().padStart(6, "0");
}

/** Étiquette article : « 000482-02 ». */
export function formatLabelNumber(orderNumber: number, piece: number): string {
  return `${formatOrderNumber(orderNumber)}-${piece.toString().padStart(2, "0")}`;
}
