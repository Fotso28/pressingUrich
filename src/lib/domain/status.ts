export type OrderStatus = "DEPOSEE" | "EN_TRAITEMENT" | "PRETE" | "RETIREE" | "ANNULEE";
export type PaymentStatus = "NON_PAYE" | "ACOMPTE" | "SOLDE";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DEPOSEE: "Déposée",
  EN_TRAITEMENT: "En traitement",
  PRETE: "Prête",
  RETIREE: "Retirée",
  ANNULEE: "Annulée",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  NON_PAYE: "Non payé",
  ACOMPTE: "Acompte",
  SOLDE: "Soldé",
};

/** RG-02 : statut de paiement calculé, jamais saisi. */
export function computePaymentStatus(paid: number, total: number): PaymentStatus {
  if (paid <= 0) return total <= 0 ? "SOLDE" : "NON_PAYE";
  if (paid < total) return "ACOMPTE";
  return "SOLDE";
}

/** RG-01 : étape suivante du cycle atelier (le retrait passe par collectOrder). */
export function nextWorkshopStatus(s: OrderStatus): OrderStatus | null {
  if (s === "DEPOSEE") return "EN_TRAITEMENT";
  if (s === "EN_TRAITEMENT") return "PRETE";
  return null;
}

export const NEXT_STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  DEPOSEE: "Démarrer",
  EN_TRAITEMENT: "Marquer prête",
};

export function canCancel(s: OrderStatus): boolean {
  return s === "DEPOSEE" || s === "EN_TRAITEMENT";
}

/** Ordre du cycle, pour autoriser un retour en arrière par le gérant. */
const ORDER: OrderStatus[] = ["DEPOSEE", "EN_TRAITEMENT", "PRETE", "RETIREE"];
export function previousStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER.indexOf(s);
  return i > 0 ? ORDER[i - 1] : null;
}

export function isOpenStatus(s: OrderStatus): boolean {
  return s === "DEPOSEE" || s === "EN_TRAITEMENT" || s === "PRETE";
}

/** F-ATL-03 : date prévue dépassée et commande pas encore prête. */
export function isLate(o: { status: OrderStatus; dueAt: Date }, now = new Date()): boolean {
  return (o.status === "DEPOSEE" || o.status === "EN_TRAITEMENT") && o.dueAt.getTime() < now.getTime();
}

/** RG-10 : prête depuis plus de N jours. */
export function isAbandoned(
  o: { status: OrderStatus; readyAt: Date | null },
  days: number,
  now = new Date(),
): boolean {
  if (o.status !== "PRETE" || !o.readyAt) return false;
  return now.getTime() - o.readyAt.getTime() > days * 86_400_000;
}
