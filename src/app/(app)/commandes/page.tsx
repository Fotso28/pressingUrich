import Link from "next/link";
import { pageUser } from "@/server/session";
import { countByTab, listOrders, type OrdersTab } from "@/server/queries/orders";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrdersTable } from "./orders-table";
import { cn } from "@/lib/cn";
import { fromDateTimeLocal } from "@/lib/domain/dates";
import { Plus } from "lucide-react";

export const metadata = { title: "Commandes" };

const TABS: { key: OrdersTab; label: string }[] = [
  { key: "a-traiter", label: "À traiter" },
  { key: "pretes", label: "Prêtes" },
  { key: "retirees", label: "Retirées" },
  { key: "annulees", label: "Annulées" },
  { key: "toutes", label: "Toutes" },
];

type SP = { tab?: string; retard?: string; impaye?: string; du?: string; au?: string; page?: string };

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
  const from = sp.du ? fromDateTimeLocal(`${sp.du}T00:00`) : undefined;
  const to = sp.au ? new Date(fromDateTimeLocal(`${sp.au}T00:00`).getTime() + 86_400_000) : undefined;
  const [counts, data, settings] = await Promise.all([
    countByTab(),
    listOrders({ tab, late: sp.retard === "1", unpaid: sp.impaye === "1", from: from && !isNaN(+from) ? from : undefined, to: to && !isNaN(+to) ? to : undefined, page: Number(sp.page) || 1 }),
    getSettings(),
  ]);
  const base: SP = { tab, retard: sp.retard, impaye: sp.impaye, du: sp.du, au: sp.au };
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

      <form className="mb-5 flex flex-wrap items-center gap-2" action="/commandes">
        <input type="hidden" name="tab" value={tab} />
        {/* « En retard » n'a de sens que pour les commandes encore à l'atelier. */}
        {(tab === "a-traiter" || tab === "toutes") && <Link href={qs(base, { retard: sp.retard === "1" ? undefined : "1", page: undefined })} className={chip(sp.retard === "1")}>En retard</Link>}
        <Link href={qs(base, { impaye: sp.impaye === "1" ? undefined : "1", page: undefined })} className={chip(sp.impaye === "1")}>Impayées</Link>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" />
        {sp.retard && <input type="hidden" name="retard" value="1" />}
        {sp.impaye && <input type="hidden" name="impaye" value="1" />}
        <label className="flex items-center gap-2 text-sm text-ink-3">Du
          <input type="date" name="du" defaultValue={sp.du} className="h-9 rounded-md border border-line-2 bg-surface px-2 text-sm text-ink tnum" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-3">au
          <input type="date" name="au" defaultValue={sp.au} className="h-9 rounded-md border border-line-2 bg-surface px-2 text-sm text-ink tnum" />
        </label>
        <Button type="submit" size="sm" variant="secondary">Filtrer</Button>
        {(sp.retard || sp.impaye || sp.du || sp.au) && <Link href={qs({ tab }, {})} className="text-sm font-medium text-brand">Effacer</Link>}
      </form>

      <OrdersTable rows={data.rows} tab={tab} abandonedAfterDays={settings.abandonedAfterDays} isAdmin={user.role === "ADMIN"} />

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
