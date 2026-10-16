export type DiscountInput =
  | { type: "MONTANT"; value: number }
  | { type: "POURCENT"; value: number }
  | null;

export interface LineInput {
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  expressAmount: number;
  discountAmount: number;
  total: number;
  /** Remise exprimée en % du montant avant remise (pour le plafond agent). */
  discountPct: number;
}

/**
 * RG-04 : sous-total = Σ (prix × quantité) ; majoration express = sous-total × taux ;
 * total = sous-total + majoration − remise. Les montants calculés sont des multiples de 100 FCFA :
 * majoration arrondie à la centaine supérieure, remise en % à la centaine inférieure.
 * La remise en % s'applique au montant majoré ; elle ne peut pas rendre le total négatif.
 */
export function computeOrderTotals(
  lines: LineInput[],
  opts: { isExpress: boolean; expressRatePct: number; discount: DiscountInput },
): OrderTotals {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.unitPrice) * Math.round(l.quantity), 0);
  const expressAmount = opts.isExpress ? Math.ceil((subtotal * opts.expressRatePct) / 100 / 100) * 100 : 0;
  const gross = subtotal + expressAmount;
  let discountAmount = 0;
  if (opts.discount && opts.discount.value > 0) {
    discountAmount =
      opts.discount.type === "POURCENT"
        ? Math.floor((gross * Math.min(opts.discount.value, 100)) / 100 / 100) * 100
        : Math.round(opts.discount.value);
  }
  discountAmount = Math.min(Math.max(discountAmount, 0), gross);
  const total = gross - discountAmount;
  const discountPct = gross > 0 ? (discountAmount / gross) * 100 : 0;
  return { subtotal, expressAmount, discountAmount, total, discountPct };
}
