import type { Method } from "@/lib/domain/cash";

/** Bloc de numéros réservés par compte pour le hors ligne, renouvelé quand 75 % sont utilisés. */
export const NUMBER_BLOCK = 200;
export const REFILL_WHEN_LEFT = NUMBER_BLOCK / 4;

export type OfflineCustomer = { id: string; fullName: string; phone: string; searchName: string; phoneNormalized: string };

export type OfflineItem = {
  itemLabel: string; serviceLabel: string; unitPrice: number; quantity: number; lineTotal: number;
  color: string | null; brand: string | null; observations: string | null; description?: string | null;
};

export type OfflineOrder = {
  id: string; number: number; status: "DEPOSEE" | "EN_TRAITEMENT" | "PRETE" | "RETIREE";
  customerId: string; customerName: string; customerPhone: string;
  isExpress: boolean; expressRatePct: number; subtotal: number; expressAmount: number; discountAmount: number;
  total: number; amountPaid: number; dueAt: string; createdAt: string; collectedAt: string | null; notes: string | null;
  lastMethod: Method | null; createdByName: string; items: OfflineItem[];
  /** Créée ou modifiée hors ligne, pas encore synchronisée. */
  pending?: boolean;
};

export type MethodTotals = Record<Method, number>;

export type OfflineSession = {
  id: string; openedAt: string; openingFloat: number;
  received: MethodTotals; spent: MethodTotals;
  moves: { id: string; kind: "PAIEMENT" | "DEPENSE"; label: string; method: Method; amount: number; at: string }[];
  pending?: boolean;
};

export type Snapshot = {
  user: { id: string; name: string; username: string | null; role: "ADMIN" | "AGENT" };
  expiresAt: string;
  serverTime: string;
  settings: { shopName: string; address: string | null; phones: string | null; ticketFooter: string | null; website: string | null; paperFormat: string; standardDelayHours: number; expressDelayHours: number; expressRatePct: number };
  catalog: {
    items: { id: string; name: string; isFrequent: boolean }[];
    services: { id: string; name: string; shortName: string }[];
    prices: { itemTypeId: string; serviceId: string; amount: number; maxAmount: number | null }[];
  };
  customers: OfflineCustomer[];
  orders: OfflineOrder[];
  session: OfflineSession | null;
  numbers: number[];
};

type Base = { opId: string; at: string };
export type OfflineOp =
  | (Base & { type: "OPEN_CASH"; sessionId: string; openingFloat: number })
  | (Base & { type: "CREATE_CUSTOMER"; id: string; fullName: string; phone: string })
  | (Base & {
      type: "CREATE_ORDER"; id: string; number: number; customerId: string; isExpress: boolean; dueAt: string; notes: string | null;
      lines: { itemTypeId: string; serviceId: string; quantity: number; unitPrice?: number | null; description?: string | null; color: string | null; brand: string | null; observations: string | null }[];
      deposit: { paymentId: string; sessionId: string; amount: number; method: Method; reference: string | null } | null;
    })
  | (Base & { type: "ADD_PAYMENT"; paymentId: string; orderId: string; sessionId: string; amount: number; method: Method; reference: string | null })
  | (Base & { type: "COLLECT_ORDER"; orderId: string })
  | (Base & { type: "ADD_EXPENSE"; expenseId: string; sessionId: string; label: string; category: string; method: Method; amount: number })
  | (Base & { type: "CLOSE_CASH"; sessionId: string; counts: MethodTotals; comment: string | null });

export type OpResult = { opId: string; ok: boolean; error?: string; data?: Record<string, unknown> };

export const OP_LABEL: Record<OfflineOp["type"], string> = {
  OPEN_CASH: "Ouverture de caisse", CREATE_CUSTOMER: "Nouveau client", CREATE_ORDER: "Dépôt", ADD_PAYMENT: "Encaissement",
  COLLECT_ORDER: "Retrait", ADD_EXPENSE: "Dépense de caisse", CLOSE_CASH: "Clôture de caisse",
};
