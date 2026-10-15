import "server-only";
import { asc } from "drizzle-orm";
import { db } from "../db";
import { itemTypes, prices, services } from "../db/schema";

export async function getCatalog() {
  const [items, svcs, pr] = await Promise.all([
    db.select().from(itemTypes).orderBy(asc(itemTypes.sortOrder), asc(itemTypes.name)),
    db.select().from(services).orderBy(asc(services.name)),
    db.select().from(prices),
  ]);
  return { items, services: svcs, prices: pr };
}

export type DepositCatalog = {
  items: { id: string; name: string; isFrequent: boolean }[];
  services: { id: string; name: string; shortName: string }[];
  prices: { itemTypeId: string; serviceId: string; amount: number }[];
};

/** Catalogue proposé au dépôt : uniquement les combinaisons actives avec un prix (F-CAT-03). */
export async function getDepositCatalog(): Promise<DepositCatalog> {
  const c = await getCatalog();
  const items = c.items.filter((i) => i.active);
  const svcs = c.services.filter((s) => s.active);
  const pr = c.prices.filter((p) => p.active && items.some((i) => i.id === p.itemTypeId) && svcs.some((s) => s.id === p.serviceId));
  return {
    items: items.filter((i) => pr.some((p) => p.itemTypeId === i.id)).map(({ id, name, isFrequent }) => ({ id, name, isFrequent })),
    services: svcs.map(({ id, name, shortName }) => ({ id, name, shortName })),
    prices: pr.map(({ itemTypeId, serviceId, amount }) => ({ itemTypeId, serviceId, amount })),
  };
}
