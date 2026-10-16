import Link from "next/link";
import { Search, Users, ChevronRight } from "lucide-react";
import { pageUser } from "@/server/session";
import { listCustomers } from "@/server/queries/customers";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { formatPhone } from "@/lib/domain/normalize";
import { NewCustomerButton } from "./new-customer-button";

export const metadata = { title: "Clients" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await pageUser();
  const { q = "", page } = await searchParams;
  const p = Math.max(1, Number(page) || 1);
  const data = await listCustomers(q, p);
  return (
    <>
      <PageHeader title="Clients" description="Recherche par téléphone ou par nom." actions={<NewCustomerButton />} />
      <form action="/clients" className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-3" />
        <input name="q" defaultValue={q} placeholder="Téléphone ou nom…" autoComplete="off"
          className="h-12 w-full rounded-lg border border-line-2 bg-surface pl-11 pr-28 text-base outline-none focus:border-brand focus:ring-3 focus:ring-brand/12" />
        <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">Chercher</Button>
      </form>
      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
        {data.rows.length === 0 ? (
          <EmptyState icon={<Users />} title={q ? "Aucun client trouvé" : "Aucun client"}>{q ? "Vérifiez l'orthographe ou le numéro (2 caractères minimum)." : "Les clients sont créés lors du dépôt."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            <li className="hidden grid-cols-[1fr_180px_120px_140px_24px] gap-4 bg-canvas/70 px-5 py-2.5 text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3 sm:grid">
              <span>Nom</span><span>Téléphone</span><span className="text-right">En cours</span><span className="text-right">Montant dû</span><span />
            </li>
            {data.rows.map((c) => (
              <li key={c.id}>
                <Link href={`/clients/${c.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 px-5 py-3.5 transition hover:bg-canvas sm:grid-cols-[1fr_180px_120px_140px_24px]">
                  <span className="truncate font-medium">{c.fullName}</span>
                  <span className="text-sm text-ink-2 tnum sm:text-[14.5px]">{formatPhone(c.phone)}</span>
                  <span className="hidden text-right tnum sm:block">{c.openOrders || <span className="text-ink-3">—</span>}</span>
                  <span className="hidden text-right sm:block">{c.due > 0 ? <Money value={c.due} strong className="text-warning" /> : <span className="text-ink-3">—</span>}</span>
                  <ChevronRight className="hidden size-4 text-ink-3 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!q && data.pages > 1 && (
        <div className="mt-4 flex justify-end gap-2">
          {p > 1 && <Button asChild size="sm" variant="secondary"><Link href={`/clients?page=${p - 1}`}>Précédent</Link></Button>}
          {p < data.pages && <Button asChild size="sm" variant="secondary"><Link href={`/clients?page=${p + 1}`}>Suivant</Link></Button>}
        </div>
      )}
    </>
  );
}
