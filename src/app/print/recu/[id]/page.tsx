import { notFound } from "next/navigation";
import { getOrder } from "@/server/queries/orders";
import { getSettings } from "@/server/queries/settings";
import { pageUser } from "@/server/session";
import { Ticket } from "@/components/ticket";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o, s, u] = await Promise.all([getOrder(id), getSettings(), pageUser()]);
  if (!o) notFound();
  // Reçu de retrait : l'agent est celui qui a remis la commande au client.
  const [by] = o.order.collectedBy ? await db.select({ name: user.name }).from(user).where(eq(user.id, o.order.collectedBy)).limit(1) : [];
  return <Ticket o={o} s={s} kind="recu" agentName={by?.name ?? u.name} />;
}
