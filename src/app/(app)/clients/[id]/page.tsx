import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackagePlus, Phone, MapPin, StickyNote, ListOrdered, Scale } from "lucide-react";
import { pageUser } from "@/server/session";
import { getCustomer } from "@/server/queries/customers";
import { customerForfait } from "@/server/queries/forfaits";
import { formatKg } from "@/lib/domain/kilo";
import { AdjustForfaitButton } from "./adjust-forfait-button";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrderListCompact } from "@/components/orders/order-list-compact";
import { formatAmount } from "@/lib/domain/money";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/normalize";
import { isOpenStatus } from "@/lib/domain/status";
import { EditCustomerButton } from "./edit-customer-button";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, forfait] = await Promise.all([getCustomer(id), customerForfait(id)]);
  if (!c) notFound();
  const open = c.orders.filter((o) => isOpenStatus(o.status));
  const past = c.orders.filter((o) => !isOpenStatus(o.status));
  const spent = c.orders.filter((o) => o.status !== "ANNULEE").reduce((s, o) => s + o.amountPaid, 0);
  return (
    <>
      <Link href="/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />Clients</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-xl font-semibold text-brand">{c.fullName.slice(0, 1).toUpperCase()}</span>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.01em]">{c.fullName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] text-ink-2">
              <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 tnum hover:text-brand"><Phone className="size-4 text-ink-3" />{formatPhone(c.phone)}</a>
              {c.address && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 text-ink-3" />{c.address}</span>}
              <span className="text-ink-3">Client depuis le {formatDate(c.createdAt)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href={`/commandes?tab=toutes&client=${c.id}`}><ListOrdered />Toutes ses commandes ({c.orders.length})</Link></Button>
          <EditCustomerButton customer={{ id: c.id, fullName: c.fullName, phone: c.phone, address: c.address ?? "", notes: c.notes ?? "" }} />
          <Button asChild><Link href={`/depot/nouveau?client=${c.id}`}><PackagePlus />Nouveau dépôt pour ce client</Link></Button>
        </div>
      </div>
      {c.notes && <p className="mb-6 flex items-start gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink-2"><StickyNote className="mt-0.5 size-4 text-ink-3" />{c.notes}</p>}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Commandes en cours" value={c.openOrders} />
        <Stat label="Solde forfait" value={formatKg(forfait.balanceGrams)} sub={forfait.moves.length ? "linge au kilo" : "aucun forfait"} />
        <Stat label="Total dû" value={formatAmount(c.due)} sub="FCFA" tone={c.due > 0 ? "warning" : undefined} />
        <Stat label="Total payé" value={formatAmount(spent)} sub={`FCFA sur ${c.orders.length} commande(s)`} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Non retirées" description="Déposées, en traitement ou prêtes" />
          {open.length ? <OrderListCompact orders={open} show="due" /> : <EmptyState title="Aucune commande en cours" />}
        </Card>
        <Card>
          <CardHeader title="Historique" description={`${past.length} commande(s) retirée(s) ou annulée(s)`} />
          {past.length ? <OrderListCompact orders={past} show="created" /> : <EmptyState title="Pas encore d'historique" />}
        </Card>
      </div>
      {(forfait.moves.length > 0 || user.role === "ADMIN") && (
        <Card className="mt-6">
          <CardHeader title="Forfait au kilo" description={`Solde : ${formatKg(forfait.balanceGrams)}`}
            action={<div className="flex items-center gap-2">
              <Button asChild size="sm" variant="secondary"><Link href={`/forfaits?periode=tout&client=${c.id}`}><Scale />Tout l&apos;historique</Link></Button>
              {user.role === "ADMIN" && <AdjustForfaitButton customerId={c.id} />}
            </div>} />
          {forfait.moves.length === 0 ? <EmptyState title="Aucun mouvement">Le client achète un forfait au dépôt (onglet « Au kilo »).</EmptyState> : (
            <ul className="divide-y divide-line border-t border-line">
              {forfait.moves.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.label}</p>
                    <p className="text-[13px] text-ink-3 tnum">{formatDateTime(m.at)}{m.orderId && <> · <Link href={`/commandes/${m.orderId}`} className="text-brand">N° {String(m.orderNumber).padStart(6, "0")}</Link></>}{m.by && ` · ${m.by}`}</p>
                  </div>
                  <span className={m.grams >= 0 ? "font-semibold text-success tnum" : "font-semibold tnum"}>{m.grams >= 0 ? "+" : "−"}{formatKg(Math.abs(m.grams))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
