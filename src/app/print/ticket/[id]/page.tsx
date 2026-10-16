import { notFound } from "next/navigation";
import { getOrder } from "@/server/queries/orders";
import { getSettings } from "@/server/queries/settings";
import { pageUser } from "@/server/session";
import { Ticket } from "@/components/ticket";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o, s, u] = await Promise.all([getOrder(id), getSettings(), pageUser()]);
  if (!o) notFound();
  return <Ticket o={o} s={s} kind="ticket" agentName={o.createdByName ?? u?.name ?? ""} />;
}
