export type Method = "ESPECES" | "MTN_MOMO" | "ORANGE_MONEY";
export const METHODS: Method[] = ["ESPECES", "MTN_MOMO", "ORANGE_MONEY"];
export const METHOD_LABEL: Record<Method, string> = {
  ESPECES: "Espèces",
  MTN_MOMO: "MTN MoMo",
  ORANGE_MONEY: "Orange Money",
};

export interface CashLine { method: Method; amount: number; voided?: boolean }

export interface CashSummaryRow { method: Method; float: number; received: number; spent: number; expected: number }

/** RG-09 : attendu = fond + encaissements − dépenses, par mode, hors annulés. Le fond est en espèces. */
export function computeCashExpected(openingFloat: number, payments: CashLine[], expenses: CashLine[]): CashSummaryRow[] {
  return METHODS.map((method) => {
    const float = method === "ESPECES" ? openingFloat : 0;
    const received = payments.filter((p) => p.method === method && !p.voided).reduce((s, p) => s + p.amount, 0);
    const spent = expenses.filter((e) => e.method === method && !e.voided).reduce((s, e) => s + e.amount, 0);
    return { method, float, received, spent, expected: float + received - spent };
  });
}

export type OutflowCategory = "INTRANTS" | "SALAIRES" | "LOYER" | "ENERGIE_EAU" | "TRANSPORT" | "ENTRETIEN" | "TAXES" | "AUTRE";
export const OUTFLOW_CATEGORIES: OutflowCategory[] = ["INTRANTS", "SALAIRES", "LOYER", "ENERGIE_EAU", "TRANSPORT", "ENTRETIEN", "TAXES", "AUTRE"];
export const OUTFLOW_CATEGORY_LABEL: Record<OutflowCategory, string> = {
  INTRANTS: "Achat d'intrants",
  SALAIRES: "Salaires",
  LOYER: "Loyer",
  ENERGIE_EAU: "Électricité et eau",
  TRANSPORT: "Transport",
  ENTRETIEN: "Entretien et réparations",
  TAXES: "Impôts et taxes",
  AUTRE: "Autre",
};
export type OutflowMethod = Method | "BANQUE";
export const OUTFLOW_METHODS: OutflowMethod[] = ["ESPECES", "MTN_MOMO", "ORANGE_MONEY", "BANQUE"];
export const OUTFLOW_METHOD_LABEL: Record<OutflowMethod, string> = { ...METHOD_LABEL, BANQUE: "Banque / virement" };

/** Catégories des petites dépenses de caisse, rattachées aux catégories de sorties pour les rapports. */
export const EXPENSE_CATEGORIES = ["Intrants", "Transport", "Énergie", "Autre"] as const;
export function expenseToOutflowCategory(c: string): OutflowCategory {
  if (c === "Intrants" || c === "Consommables") return "INTRANTS";
  if (c === "Transport") return "TRANSPORT";
  if (c === "Énergie") return "ENERGIE_EAU";
  return "AUTRE";
}
