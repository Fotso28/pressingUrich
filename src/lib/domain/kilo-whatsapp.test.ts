import { describe, expect, it } from "vitest";
import { allocateKilo, formatKg, kiloLinePrice, parseKg } from "./kilo";
import { waLink, waNumber } from "./whatsapp";
import { resolvePeriod } from "./period";
import { computeOrderTotals } from "./totals";

describe("linge au kilo et forfaits", () => {
  it("lit et affiche les poids", () => {
    expect(parseKg("4,5")).toBe(4500);
    expect(parseKg("23")).toBe(23000);
    expect(parseKg("0")).toBeNull();
    expect(parseKg("abc")).toBeNull();
    expect(formatKg(23000)).toBe("23 kg");
    expect(formatKg(4500)).toBe("4,5 kg");
  });

  it("facture le linge au prix du kilo de son type", () => {
    const a = allocateKilo(0, [{ kind: "KILO", grams: 5000, pricePerKg: 1000 }, { kind: "KILO", grams: 2300, pricePerKg: 1200 }]);
    expect(a.lines.map((l) => l?.price)).toEqual([5000, 2800]); // 2,3 × 1 200 = 2 760 → 2 800
    expect(kiloLinePrice(2300, 870)).toBe(2100); // arrondi à la centaine supérieure
  });

  it("déduit d'abord le solde forfait (achats du dépôt compris), facture le reste", () => {
    const a = allocateKilo(2000, [{ kind: "FORFAIT", grams: 23000 }, { kind: "KILO", grams: 8000, pricePerKg: 1000 }]);
    expect(a.lines[1]).toEqual({ covered: 8000, uncovered: 0, price: 0 });
    expect(a.balanceAfter).toBe(17000);
    const part = allocateKilo(3000, [{ kind: "KILO", grams: 5000, pricePerKg: 1000 }]);
    expect(part.lines[0]).toEqual({ covered: 3000, uncovered: 2000, price: 2000 });
    // Hors ligne : le solde n'est pas utilisé.
    expect(allocateKilo(3000, [{ kind: "KILO", grams: 5000, pricePerKg: 1000, useForfait: false }]).lines[0]?.price).toBe(5000);
  });

  it("n'applique pas la majoration express aux achats de forfait", () => {
    const t = computeOrderTotals([{ unitPrice: 20000, quantity: 1, noSurcharge: true }, { unitPrice: 1000, quantity: 2 }], { isExpress: true, expressRatePct: 50, discount: null });
    expect(t.expressAmount).toBe(1000);
    expect(t.total).toBe(23000);
  });
});

describe("WhatsApp", () => {
  it("ajoute le préfixe 237 seulement s'il manque", () => {
    expect(waNumber("6 77 12 34 56")).toBe("237677123456");
    expect(waNumber("+237 677 12 34 56")).toBe("237677123456");
    expect(waNumber("00237677123456")).toBe("237677123456");
    expect(waNumber("237677123456")).toBe("237677123456");
    expect(waLink("677123456", "Bonjour !")).toBe("https://wa.me/237677123456?text=Bonjour%20!");
  });
});

describe("filtre de période", () => {
  it("jour, mois et période personnalisée (bornes incluses, à l'heure de Douala)", () => {
    const d = resolvePeriod({ periode: "jour", jour: "2026-10-05" })!;
    expect(d.from.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(d.to.toISOString()).toBe("2026-10-05T23:00:00.000Z");
    const m = resolvePeriod({ periode: "mois", mois: "2026-09" })!;
    expect(m.from.toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(m.to.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    const p = resolvePeriod({ du: "2026-10-10", au: "2026-10-01" })!; // bornes inversées remises dans l'ordre
    expect(p.mode).toBe("perso");
    expect(p.from.toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-10T23:00:00.000Z");
    expect(resolvePeriod({})).toBeNull();
    expect(resolvePeriod({}, "jour")?.mode).toBe("jour");
  });
});
