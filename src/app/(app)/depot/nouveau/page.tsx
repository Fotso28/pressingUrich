import { eq } from "drizzle-orm";
import { pageUser } from "@/server/session";
import { getDepositCatalog } from "@/server/queries/catalog";
import { getSettings } from "@/server/queries/settings";
import { getOpenCashSession } from "@/server/queries/cash";
import { db } from "@/server/db";
import { customers } from "@/server/db/schema";
import { DepositForm } from "./deposit-form";

export const metadata = { title: "Nouveau dépôt" };

export default async function NewDepositPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const user = await pageUser();
  const { client } = await searchParams;
  const [catalog, settings, session] = await Promise.all([getDepositCatalog(), getSettings(), getOpenCashSession(user.id)]);
  let initialCustomer = null;
  if (client && /^[0-9a-f-]{36}$/i.test(client)) {
    const [c] = await db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone }).from(customers).where(eq(customers.id, client)).limit(1);
    initialCustomer = c ?? null;
  }
  return (
    <DepositForm
      catalog={catalog}
      initialCustomer={initialCustomer}
      hasOpenSession={!!session}
      isAdmin={user.role === "ADMIN"}
      settings={{
        standardDelayHours: settings.standardDelayHours, expressDelayHours: settings.expressDelayHours,
        expressRatePct: settings.expressRatePct, agentMaxDiscountPct: settings.agentMaxDiscountPct,
      }}
    />
  );
}
