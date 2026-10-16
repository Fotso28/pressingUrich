import { getSettings } from "@/server/queries/settings";
import { ShopSettingsForm } from "./form";
import { paperOf } from "@/components/print/ticket-css";

export const metadata = { title: "Paramètres du pressing" };

export default async function Page() {
  const s = await getSettings();
  return <ShopSettingsForm initial={{
    shopName: s.shopName, address: s.address ?? "", phones: s.phones ?? "", ticketFooter: s.ticketFooter ?? "", website: s.website ?? "", paperFormat: paperOf(s.paperFormat),
    standardDelayHours: s.standardDelayHours, expressDelayHours: s.expressDelayHours, expressRatePct: s.expressRatePct,
    abandonedAfterDays: s.abandonedAfterDays, agentMaxDiscountPct: s.agentMaxDiscountPct,
  }} />;
}
