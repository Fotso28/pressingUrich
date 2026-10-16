import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Plus, ArrowRight } from "lucide-react";
import { pageUser } from "@/server/session";
import { getOrder } from "@/server/queries/orders";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/components/money";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatDateTime } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/normalize";
import { formatKg } from "@/lib/domain/kilo";
import { depositMessage } from "@/lib/domain/whatsapp";
import { getSettings } from "@/server/queries/settings";
import { WhatsAppButton } from "@/components/whatsapp-button";

export const metadata = { title: "Dépôt enregistré" };

export default async function ConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  await pageUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [o, settings] = await Promise.all([getOrder(id), getSettings()]);
  if (!o) notFound();
  const remaining = o.order.total - o.order.amountPaid;
  const pieces = o.items.reduce((s, i) => s + (i.kind === "PIECE" ? i.quantity : 0), 0);
  const grams = o.items.reduce((s, i) => s + (i.kind === "KILO" ? (i.weightGrams ?? 0) : 0), 0);
  const what = [pieces ? `${pieces} pièce${pieces > 1 ? "s" : ""}` : "", grams ? formatKg(grams) : ""].filter(Boolean).join(" · ") || "Forfait";
  const message = depositMessage({
    shopName: settings.shopName, customerName: o.customer.fullName, number: formatOrderNumber(o.order.number), total: o.order.total, amountPaid: o.order.amountPaid,
    dueAt: o.items.every((i) => i.kind === "FORFAIT") ? undefined : formatDateTime(o.order.dueAt), items: o.items,
  });
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success-50 text-success"><CheckCircle2 className="size-7" /></span>
          <p className="mt-4 text-sm font-medium text-ink-3">Dépôt enregistré · Ticket n°</p>
          <p className="mt-1 text-[56px] font-semibold leading-none tracking-[-0.03em] tnum text-ink">{formatOrderNumber(o.order.number)}</p>
          <p className="mt-4 text-[17px] font-semibold">{o.customer.fullName}</p>
          <p className="text-sm text-ink-3 tnum">{formatPhone(o.customer.phone)} · {what}</p>
        </div>
        <dl className="grid grid-cols-3 border-y border-line text-center">
          <div className="px-3 py-4"><dt className="eyebrow">Total</dt><dd className="mt-1.5 text-lg font-semibold"><Money value={o.order.total} /></dd></div>
          <div className="border-x border-line px-3 py-4"><dt className="eyebrow">Payé</dt><dd className="mt-1.5 text-lg font-semibold text-success"><Money value={o.order.amountPaid} /></dd></div>
          <div className="px-3 py-4"><dt className="eyebrow">Reste</dt><dd className={`mt-1.5 text-lg font-semibold ${remaining > 0 ? "text-warning" : ""}`}><Money value={remaining} /></dd></div>
        </dl>
        <p className="px-6 py-4 text-center text-[15px] text-ink-2">Retrait prévu le <span className="font-semibold text-ink tnum">{formatDateTime(o.order.dueAt)}</span>{o.order.isExpress && <span className="ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-[12.5px] font-medium text-[#b56a00]">Express</span>}</p>
        <div className="grid grid-cols-1 gap-2 border-t border-line p-5 sm:grid-cols-2">
          <WhatsAppButton phone={o.customer.phone} text={message} label="Envoyer le récapitulatif sur WhatsApp" size="lg" className="sm:col-span-2" />
          <PrintButton href={`/print/ticket/${o.order.id}`} size="lg">Imprimer le ticket</PrintButton>
          <PrintButton href={`/print/etiquettes/${o.order.id}`} size="lg">Imprimer les étiquettes</PrintButton>
          <Button asChild size="lg" className="sm:col-span-2"><Link href="/depot/nouveau"><Plus />Nouveau dépôt</Link></Button>
        </div>
      </div>
      <p className="mt-4 text-center"><Link href={`/commandes/${o.order.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand">Voir la commande <ArrowRight className="size-4" /></Link></p>
    </div>
  );
}
