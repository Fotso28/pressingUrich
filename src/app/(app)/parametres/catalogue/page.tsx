import { getCatalog } from "@/server/queries/catalog";
import { CatalogEditor } from "./editor";

export const metadata = { title: "Catalogue et tarifs" };

export default async function Page() {
  const c = await getCatalog();
  return <CatalogEditor
    items={c.items.map(({ id, name, isFrequent, sortOrder, active }) => ({ id, name, isFrequent, sortOrder, active }))}
    services={c.services.map(({ id, name, shortName, active }) => ({ id, name, shortName, active }))}
    prices={c.prices.map(({ itemTypeId, serviceId, amount, active }) => ({ itemTypeId, serviceId, amount, active }))} />;
}
