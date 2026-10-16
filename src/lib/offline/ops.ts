import { computeOrderTotals } from "@/lib/domain/totals";
import { METHODS } from "@/lib/domain/cash";
import { formatOrderNumber } from "@/lib/domain/order-number";
import type { OfflineOp, OfflineOrder, Snapshot } from "./types";

type State = Snapshot & { queue: OfflineOp[] };
const zero = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<(typeof METHODS)[number], number>;

/** Applique une opération à la copie locale (même effet que sur le serveur, pour l'affichage hors ligne). */
export function applyOp(s: State, op: OfflineOp): void {
  switch (op.type) {
    case "OPEN_CASH":
      s.session = { id: op.sessionId, openedAt: op.at, openingFloat: op.openingFloat, received: zero(), spent: zero(), moves: [], pending: true };
      return;
    case "CREATE_CUSTOMER":
      if (!s.customers.some((c) => c.id === op.id)) {
        s.customers.push({ id: op.id, fullName: op.fullName, phone: op.phone, searchName: op.fullName.toLowerCase(), phoneNormalized: op.phone.replace(/\D/g, "").slice(-9) });
      }
      return;
    case "CREATE_ORDER": {
      const c = s.customers.find((x) => x.id === op.customerId);
      const items = op.lines.map((l) => {
        const p = s.catalog.prices.find((x) => x.itemTypeId === l.itemTypeId && x.serviceId === l.serviceId);
        const unitPrice = p?.amount ?? 0;
        return {
          itemLabel: s.catalog.items.find((i) => i.id === l.itemTypeId)?.name ?? "Article",
          serviceLabel: s.catalog.services.find((x) => x.id === l.serviceId)?.shortName ?? "",
          unitPrice, quantity: l.quantity, lineTotal: unitPrice * l.quantity, color: l.color, brand: l.brand, observations: l.observations,
        };
      });
      const rate = op.isExpress ? s.settings.expressRatePct : 0;
      const t = computeOrderTotals(items, { isExpress: op.isExpress, expressRatePct: rate, discount: null });
      const order: OfflineOrder = {
        id: op.id, number: op.number, status: "DEPOSEE", customerId: op.customerId, customerName: c?.fullName ?? "Client", customerPhone: c?.phone ?? "",
        isExpress: op.isExpress, expressRatePct: rate, subtotal: t.subtotal, expressAmount: t.expressAmount, discountAmount: 0, total: t.total,
        amountPaid: op.deposit?.amount ?? 0, dueAt: op.dueAt, createdAt: op.at, collectedAt: null, notes: op.notes,
        lastMethod: op.deposit?.method ?? null, createdByName: s.user.name, items, pending: true,
      };
      s.orders = [order, ...s.orders.filter((o) => o.id !== op.id)];
      s.numbers = s.numbers.filter((n) => n !== op.number);
      if (op.deposit && s.session) {
        s.session.received[op.deposit.method] += op.deposit.amount;
        s.session.moves.unshift({ id: op.deposit.paymentId, kind: "PAIEMENT", label: `Ticket n° ${formatOrderNumber(op.number)} (acompte)`, method: op.deposit.method, amount: op.deposit.amount, at: op.at });
      }
      return;
    }
    case "ADD_PAYMENT": {
      const o = s.orders.find((x) => x.id === op.orderId);
      if (o) { o.amountPaid += op.amount; o.lastMethod = op.method; o.pending = true; }
      if (s.session) {
        s.session.received[op.method] += op.amount;
        s.session.moves.unshift({ id: op.paymentId, kind: "PAIEMENT", label: `Ticket n° ${o ? formatOrderNumber(o.number) : "?"}`, method: op.method, amount: op.amount, at: op.at });
      }
      return;
    }
    case "COLLECT_ORDER": {
      const o = s.orders.find((x) => x.id === op.orderId);
      if (o) { o.status = "RETIREE"; o.collectedAt = op.at; o.pending = true; }
      return;
    }
    case "ADD_EXPENSE":
      if (s.session) {
        s.session.spent[op.method] += op.amount;
        s.session.moves.unshift({ id: op.expenseId, kind: "DEPENSE", label: op.label, method: op.method, amount: op.amount, at: op.at });
      }
      return;
    case "CLOSE_CASH":
      s.session = null;
      return;
  }
}
