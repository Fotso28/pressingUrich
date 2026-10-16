import { pageAdmin } from "@/server/session";
import { getCatalog } from "@/server/queries/catalog";
import { listForfaits } from "@/server/queries/forfaits";
import { CatalogEditor } from "./editor";
import { ForfaitsEditor } from "./forfaits";

export const metadata = { title: "Catalogue et tarifs" };

export default async function Page() {
  await pageAdmin(); // contrôle aussi au niveau de la page (pas seulement du layout)
  const [c, forfaits] = await Promise.all([getCatalog(), listForfaits()]);
  return <div className="grid gap-6">
    <ForfaitsEditor forfaits={forfaits} kiloTypes={c.kiloTypes.map(({ id, name, pricePerKg, sortOrder, active }) => ({ id, name, pricePerKg, sortOrder, active }))} />
    <CatalogEditor
    items={c.items.map(({ id, name, isFrequent, sortOrder, active }) => ({ id, name, isFrequent, sortOrder, active }))}
    services={c.services.map(({ id, name, shortName, active }) => ({ id, name, shortName, active }))}
    prices={c.prices.map(({ itemTypeId, serviceId, amount, maxAmount, active }) => ({ itemTypeId, serviceId, amount, maxAmount, active }))} />
  </div>;
}
