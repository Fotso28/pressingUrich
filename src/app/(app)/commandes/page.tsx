import Link from "next/link";
import { pageUser } from "@/server/session";
import { countByTab, listOrders, type OrdersTab } from "@/server/queries/orders";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrdersTable } from "./orders-table";
import { cn } from "@/lib/cn";
import { Plus, X } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { customers } from "@/server/db/schema";
import { PeriodFilter } from "@/components/filters/period-filter";
import { dayKey, lastMonths, resolvePeriod } from "@/lib/domain/period";

export const metadata = { title: "Commandes" };

const TABS: { key: OrdersTab; label: string }[] = [
  { key: "a-traiter", label: "À traiter" },
  { key: "pretes", label: "Prêtes" },
  { key: "retirees", label: "Retirées" },
  { key: "annulees", label: "Annulées" },
  { key: "toutes", label: "Toutes" },
];

type SP = { tab?: string; retard?: string; impaye?: string; client?: string; periode?: string; jour?: string; mois?: string; du?: string; au?: string; page?: string };

function qs(base: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return `/commandes${s ? `?${s}` : ""}`;
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const tab = (TABS.some((t) => t.key === sp.tab) ? sp.tab : "a-traiter") as OrdersTab;
  // Période de dépôt (jour, mois, période personnalisée) et client : mêmes filtres pour la liste et les compteurs.
  const period = resolvePeriod(sp);
  const customerId = sp.client && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : undefined;
  const filters = { late: sp.retard === "1", unpaid: sp.impaye === "1", from: period?.from, to: period?.to, customerId };
  const [counts, data, settings, client] = await Promise.all([
    countByTab(filters),
    listOrders({ tab, ...filters, page: Number(sp.page) || 1 }),
    getSettings(),
    customerId ? db.select({ id: customers.id, fullName: customers.fullName }).from(customers).where(eq(customers.id, customerId)).limit(1).then((r) => r[0] ?? null) : null,
  ]);
  const base: SP = { tab, retard: sp.retard, impaye: sp.impaye, client: customerId, periode: sp.periode, jour: sp.jour, mois: sp.mois, du: sp.du, au: sp.au };
  const chip = (active: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition",
    active ? "border-brand bg-brand-50 text-brand" : "border-line-2 bg-surface text-ink-2 hover:bg-subtle");

  return (
    <>
      <PageHeader title="Commandes" description="Suivi atelier, retraits et historique."
        actions={<Button asChild><Link href="/depot/nouveau"><Plus />Nouveau dépôt</Link></Button>} />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <nav className="inline-flex min-w-full gap-1 border-b border-line">
          {TABS.map((t) => (
            <Link key={t.key} href={qs({ ...base, page: undefined }, { tab: t.key })}
              className={cn("relative -mb-px flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-[14.5px] font-medium transition",
                tab === t.key ? "border-brand text-brand" : "border-transparent text-ink-3 hover:text-ink")}>
              {t.label}
              <span className={cn("rounded-full px-2 py-0.5 text-[12px] tnum", tab === t.key ? "bg-brand-50" : "bg-subtle")}>{counts[t.key]}</span>
            </Link>
          ))}
        </nav>
      </div>

      {client && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-3">Commandes de</span>
          <Link href={`/clients/${client.id}`} className="font-semibold text-brand">{client.fullName}</Link>
          <Link href={qs({ ...base, client: undefined, page: undefined }, {})} className="inline-flex items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-ink-2 hover:bg-subtle"><X className="size-3.5" />Tous les clients</Link>
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {/* « En retard » n'a de sens que pour les commandes encore à l'atelier. */}
        {(tab === "a-traiter" || tab === "toutes") && <Link href={qs(base, { retard: sp.retard === "1" ? undefined : "1", page: undefined })} className={chip(sp.retard === "1")}>En retard</Link>}
        <Link href={qs(base, { impaye: sp.impaye === "1" ? undefined : "1", page: undefined })} className={chip(sp.impaye === "1")}>Impayées</Link>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        <PeriodFilter mode={period?.mode ?? null} jour={period?.jour} mois={period?.mois} du={period?.du} au={period?.au} months={lastMonths(24)} today={dayKey()} />
        {(sp.retard || sp.impaye || period || customerId) && <Link href={qs({ tab }, {})} className="text-sm font-medium text-brand">Effacer les filtres</Link>}
      </div>
      {period && <p className="-mt-2 mb-4 text-sm text-ink-3">Déposées : <span className="font-medium text-ink first-letter:uppercase">{period.label}</span></p>}

      <OrdersTable rows={data.rows} tab={tab} abandonedAfterDays={settings.abandonedAfterDays} shopName={settings.shopName} isAdmin={user.role === "ADMIN"} />

      {data.pages > 1 && (
        <div className="mt-5 flex items-center justify-between text-sm text-ink-3">
          <span className="tnum">{data.total} commandes · page {data.page}/{data.pages}</span>
          <div className="flex gap-2">
            {data.page > 1 && <Button asChild size="sm" variant="secondary"><Link href={qs(base, { page: String(data.page - 1) })}>Précédent</Link></Button>}
            {data.page < data.pages && <Button asChild size="sm" variant="secondary"><Link href={qs(base, { page: String(data.page + 1) })}>Suivant</Link></Button>}
          </div>
        </div>
      )}
    </>
  );
}
