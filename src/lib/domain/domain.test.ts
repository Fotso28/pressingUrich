import { describe, expect, it } from "vitest";
import { computeOrderTotals } from "./totals";
import { computePaymentStatus, isAbandoned, isLate, nextWorkshopStatus } from "./status";
import { classifyQuery, formatPhone, normalizeName, normalizePhone } from "./normalize";
import { computeDueAt, formatDateTime, fromDateTimeLocal, periodStart, toDateTimeLocal } from "./dates";
import { computeCashExpected } from "./cash";
import { formatAmount, formatFCFA, parseAmount } from "./money";
import { formatLabelNumber, formatOrderNumber } from "./order-number";

describe("computeOrderTotals (RG-04)", () => {
  const lines = [{ unitPrice: 1000, quantity: 2 }, { unitPrice: 5000, quantity: 1 }];
  it("sans option", () => {
    expect(computeOrderTotals(lines, { isExpress: false, expressRatePct: 50, discount: null }))
      .toMatchObject({ subtotal: 7000, expressAmount: 0, discountAmount: 0, total: 7000 });
  });
  it("express +50 % comme le ticket d'exemple", () => {
    expect(computeOrderTotals(lines, { isExpress: true, expressRatePct: 50, discount: null }))
      .toMatchObject({ subtotal: 7000, expressAmount: 3500, total: 10500 });
  });
  it("remise en montant", () => {
    expect(computeOrderTotals(lines, { isExpress: false, expressRatePct: 50, discount: { type: "MONTANT", value: 500 } }).total).toBe(6500);
  });
  it("remise en % arrondie à la centaine inférieure et pourcentage calculé", () => {
    const t = computeOrderTotals([{ unitPrice: 3300, quantity: 1 }], { isExpress: false, expressRatePct: 0, discount: { type: "POURCENT", value: 10 } });
    expect(t.discountAmount).toBe(300);
    expect(t.total).toBe(3000);
    expect(t.discountPct).toBeCloseTo(9.09, 1);
  });
  it("majoration express arrondie à la centaine supérieure", () => {
    const t = computeOrderTotals([{ unitPrice: 300, quantity: 1 }], { isExpress: true, expressRatePct: 50, discount: null });
    expect(t.expressAmount).toBe(200);
    expect(t.total).toBe(500);
  });
  it("remise plafonnée au montant", () => {
    expect(computeOrderTotals(lines, { isExpress: false, expressRatePct: 0, discount: { type: "MONTANT", value: 99999 } }).total).toBe(0);
  });
});

describe("computePaymentStatus (RG-02)", () => {
  it.each([[0, 1000, "NON_PAYE"], [500, 1000, "ACOMPTE"], [1000, 1000, "SOLDE"], [0, 0, "SOLDE"]] as const)(
    "payé %i / total %i → %s", (p, t, s) => expect(computePaymentStatus(p, t)).toBe(s));
});

describe("cycle de vie (RG-01)", () => {
  it("étapes atelier", () => {
    expect(nextWorkshopStatus("DEPOSEE")).toBe("EN_TRAITEMENT");
    expect(nextWorkshopStatus("EN_TRAITEMENT")).toBe("PRETE");
    expect(nextWorkshopStatus("PRETE")).toBeNull();
  });
  it("retard et souffrance", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(isLate({ status: "DEPOSEE", dueAt: new Date("2026-10-14T12:00:00Z") }, now)).toBe(true);
    expect(isLate({ status: "PRETE", dueAt: new Date("2026-10-14T12:00:00Z") }, now)).toBe(false);
    expect(isAbandoned({ status: "PRETE", readyAt: new Date("2026-09-01T12:00:00Z") }, 30, now)).toBe(true);
    expect(isAbandoned({ status: "PRETE", readyAt: new Date("2026-10-01T12:00:00Z") }, 30, now)).toBe(false);
  });
});

describe("normalisation (F-CLI-02/03)", () => {
  it("nom", () => expect(normalizeName("  NGONO  Marie-Thérèse ")).toBe("ngono marie-therese"));
  it.each(["+237 699 65 88 38", "00237699658838", "699-65-88-38", "237699658838", "6 99 65 88 38"])(
    "téléphone %s", (p) => expect(normalizePhone(p)).toBe("699658838"));
  it("format téléphone", () => expect(formatPhone("+237699658838")).toBe("6 99 65 88 38"));
  it("routage de la recherche", () => {
    expect(classifyQuery("482").kind).toBe("number");
    expect(classifyQuery("6996588").kind).toBe("phone");
    expect(classifyQuery("Marie Ngono")).toMatchObject({ kind: "name", words: ["marie", "ngono"] });
  });
});

describe("dates (Africa/Douala)", () => {
  it("date prévue standard et express", () => {
    const d = new Date("2026-10-15T13:30:00Z");
    expect(computeDueAt(d, { isExpress: false, standardHours: 48, expressHours: 24 }).toISOString()).toBe("2026-10-17T13:30:00.000Z");
    expect(computeDueAt(d, { isExpress: true, standardHours: 48, expressHours: 24 }).toISOString()).toBe("2026-10-16T13:30:00.000Z");
  });
  it("affichage UTC+1", () => expect(formatDateTime(new Date("2026-10-15T13:30:00Z"))).toBe("15/10/2026 14:30"));
  it("aller-retour datetime-local", () => {
    const d = new Date("2026-10-15T13:30:00Z");
    expect(toDateTimeLocal(d)).toBe("2026-10-15T14:30");
    expect(fromDateTimeLocal("2026-10-15T14:30").toISOString()).toBe(d.toISOString());
  });
  it("début de période", () => {
    const now = new Date("2026-10-15T23:30:00Z"); // 16/10 00:30 à Douala, vendredi
    expect(periodStart("day", now).toISOString()).toBe("2026-10-15T23:00:00.000Z");
    expect(periodStart("week", now).toISOString()).toBe("2026-10-11T23:00:00.000Z");
    expect(periodStart("month", now).toISOString()).toBe("2026-09-30T23:00:00.000Z");
  });
});

describe("caisse (RG-09)", () => {
  it("attendu par mode", () => {
    const rows = computeCashExpected(10000,
      [{ method: "ESPECES", amount: 5000 }, { method: "MTN_MOMO", amount: 3000 }, { method: "ESPECES", amount: 999, voided: true }],
      [{ method: "ESPECES", amount: 1500 }]);
    expect(rows.find((r) => r.method === "ESPECES")?.expected).toBe(13500);
    expect(rows.find((r) => r.method === "MTN_MOMO")?.expected).toBe(3000);
    expect(rows.find((r) => r.method === "ORANGE_MONEY")?.expected).toBe(0);
  });
});

describe("formats", () => {
  it("montants", () => {
    expect(formatAmount(12500)).toBe("12 500");
    expect(formatFCFA(1500000)).toBe("1 500 000 FCFA");
    expect(parseAmount("12 500")).toBe(12500);
    expect(Number.isNaN(parseAmount("12a"))).toBe(true);
  });
  it("numéros", () => {
    expect(formatOrderNumber(482)).toBe("000482");
    expect(formatLabelNumber(482, 2)).toBe("000482-02");
  });
});
