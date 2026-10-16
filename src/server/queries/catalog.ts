import "server-only";
import { asc, desc } from "drizzle-orm";
import { db } from "../db";
import { itemTypes, prices, services } from "../db/schema";

export async function getCatalog() {
  const [items, svcs, pr] = await Promise.all([
    db.select().from(itemTypes).orderBy(desc(itemTypes.createdAt), asc(itemTypes.name)),
    db.select().from(services).orderBy(desc(services.createdAt)),
    db.select().from(prices),
  ]);
  return { items, services: svcs, prices: pr };
}

export type DepositCatalog = {
  items: { id: string; name: string; isFrequent: boolean }[];
  services: { id: string; name: string; shortName: string }[];
  /** maxAmount : prix variable, à choisir au dépôt entre amount et maxAmount. */
  prices: { itemTypeId: string; serviceId: string; amount: number; maxAmount: number | null }[];
};

/** Catalogue proposé au dépôt : uniquement les combinaisons actives avec un prix (F-CAT-03). */
export async function getDepositCatalog(): Promise<DepositCatalog> {
  const c = await getCatalog();
  // Au dépôt, les articles suivent l'ordre d'affichage choisi par le gérant.
  const items = c.items.filter((i) => i.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "fr"));
  const svcs = c.services.filter((s) => s.active);
  const pr = c.prices.filter((p) => p.active && items.some((i) => i.id === p.itemTypeId) && svcs.some((s) => s.id === p.serviceId));
  return {
    items: items.filter((i) => pr.some((p) => p.itemTypeId === i.id)).map(({ id, name, isFrequent }) => ({ id, name, isFrequent })),
    services: svcs.map(({ id, name, shortName }) => ({ id, name, shortName })),
    prices: pr.map(({ itemTypeId, serviceId, amount, maxAmount }) => ({ itemTypeId, serviceId, amount, maxAmount })),
  };
}
