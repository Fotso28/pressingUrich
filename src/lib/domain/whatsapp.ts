import { formatAmount } from "./money";
import { formatKg } from "./kilo";

/**
 * Numéro WhatsApp international (chiffres seulement) : le préfixe 237 du Cameroun est ajouté
 * quand le numéro ne le porte pas déjà (« 6 77 12 34 56 » → « 237677123456 »).
 */
export function waNumber(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("237")) d = `237${d}`;
  return d;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

type Msg = {
  shopName: string; customerName: string; number: string; total: number; amountPaid: number; dueAt?: string;
  items: { kind: string; quantity: number; weightGrams: number | null }[];
};

const contents = (items: Msg["items"]) => {
  const pieces = items.reduce((a, i) => a + (i.kind === "PIECE" ? i.quantity : 0), 0);
  const grams = items.reduce((a, i) => a + (i.kind === "KILO" ? (i.weightGrams ?? 0) : 0), 0);
  return [pieces ? `${pieces} pièce${pieces > 1 ? "s" : ""}` : "", grams ? `${formatKg(grams)} de linge` : ""].filter(Boolean).join(" et ");
};

/** Message envoyé au client quand le dépôt est enregistré. */
export function depositMessage(m: Msg): string {
  const rest = m.total - m.amountPaid;
  const what = contents(m.items);
  return [
    `Bonjour ${m.customerName.trim()},`,
    `votre dépôt N° ${m.number} est bien enregistré chez ${m.shopName}${what ? ` (${what})` : ""}.`,
    `Total : ${formatAmount(m.total)} FCFA · payé : ${formatAmount(m.amountPaid)} FCFA${rest > 0 ? ` · reste à payer : ${formatAmount(rest)} FCFA` : ""}.`,
    m.dueAt ? `Retrait prévu le ${m.dueAt}.` : "",
    "Merci de votre confiance !",
  ].filter(Boolean).join("\n");
}

/** Message envoyé au client quand sa commande est prête. */
export function readyMessage(m: Msg): string {
  const rest = m.total - m.amountPaid;
  return [
    `Bonjour ${m.customerName.trim()},`,
    `bonne nouvelle : votre commande N° ${m.number} est prête chez ${m.shopName}.`,
    rest > 0 ? `Reste à payer au retrait : ${formatAmount(rest)} FCFA.` : "Elle est entièrement réglée.",
    "À très bientôt !",
  ].join("\n");
}
