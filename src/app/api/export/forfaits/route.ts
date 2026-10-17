import { getCurrentUser } from "@/server/session";
import { forfaitMovesBetween } from "@/server/queries/forfaits";
import { csvResponse, toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/domain/dates";
import { resolvePeriod } from "@/lib/domain/period";
import { formatOrderNumber } from "@/lib/domain/order-number";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { ACHAT: "Achat", CONSO: "Consommation", ANNULATION: "Annulation", AJUSTEMENT: "Correction" };

/** Mouvements de forfait (achats, consommations, annulations, corrections) sur la période choisie, ou tout l'historique. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new Response("Accès refusé", { status: 403 });
  const p = new URL(req.url).searchParams;
  const period = resolvePeriod({ periode: p.get("periode") ?? undefined, jour: p.get("jour") ?? undefined, mois: p.get("mois") ?? undefined, du: p.get("du") ?? undefined, au: p.get("au") ?? undefined });
  const client = p.get("client");
  const moves = await forfaitMovesBetween({ from: period?.from, to: period?.to, customerId: client && /^[0-9a-f-]{36}$/i.test(client) ? client : undefined });
  const body = toCsv(["Date", "Client", "Mouvement", "Libellé", "Kilos", "Commande", "Saisi par"],
    moves.map((m) => [formatDateTime(m.at), m.customerName, KIND_LABEL[m.kind] ?? m.kind, m.label, (m.grams / 1000).toFixed(1).replace(".", ","), m.orderNumber ? formatOrderNumber(Number(m.orderNumber)) : "", m.by]));
  const suffix = period?.mois ?? period?.jour ?? (period ? `${period.du ?? ""}_${period.au ?? ""}` : "tout");
  return csvResponse(`forfaits-${suffix}.csv`, body);
}
