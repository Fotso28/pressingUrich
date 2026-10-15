import { getSettings } from "@/server/queries/settings";
import { ShopSettingsForm } from "./form";

export const metadata = { title: "Paramètres du pressing" };

export default async function Page() {
  const s = await getSettings();
  return <ShopSettingsForm initial={{
    shopName: s.shopName, address: s.address ?? "", phones: s.phones ?? "", ticketFooter: s.ticketFooter ?? "",
    standardDelayHours: s.standardDelayHours, expressDelayHours: s.expressDelayHours, expressRatePct: s.expressRatePct,
    abandonedAfterDays: s.abandonedAfterDays, agentMaxDiscountPct: s.agentMaxDiscountPct,
  }} />;
}
