import Link from "next/link";
import { Download, Scale, X } from "lucide-react";
import { eq } from "drizzle-orm";
import { pageUser } from "@/server/session";
import { db } from "@/server/db";
import { customers } from "@/server/db/schema";
import { forfaitBalances, forfaitMovesBetween, forfaitSales } from "@/server/queries/forfaits";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodFilter } from "@/components/filters/period-filter";
import { formatAmount } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/domain/dates";
import { formatKg } from "@/lib/domain/kilo";
import { formatPhone } from "@/lib/domain/normalize";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { dayKey, lastMonths, resolvePeriod, type PeriodParams } from "@/lib/domain/period";
import { cn } from "@/lib/cn";

export const metadata = { title: "Forfaits" };

const KIND_LABEL: Record<string, string> = { ACHAT: "Achat", CONSO: "Consommation", ANNULATION: "Annulation", AJUSTEMENT: "Correction" };

/** Suivi des forfaits : soldes des clients, ventes et consommations sur une période, export CSV. */
export default async function ForfaitsPage({ searchParams }: { searchParams: Promise<PeriodParams & { client?: string }> }) {
  await pageUser();
  const sp = await searchParams;
  const period = resolvePeriod(sp, "mois");
  const customerId = sp.client && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : undefined;
  const [balances, moves, sales, client] = await Promise.all([
    forfaitBalances(),
    forfaitMovesBetween({ from: period?.from, to: period?.to, customerId }),
    forfaitSales(period?.from, period?.to),
    customerId ? db.select({ id: customers.id, fullName: customers.fullName }).from(customers).where(eq(customers.id, customerId)).limit(1).then((r) => r[0] ?? null) : null,
  ]);
  const sum = (k: string) => moves.filter((m) => m.kind === k).reduce((a, m) => a + m.grams, 0);
  const withBalance = balances.filter((b) => b.balance > 0);
  const totalBalance = withBalance.reduce((a, b) => a + b.balance, 0);
  const qs = new URLSearchParams(Object.entries({ periode: sp.periode, jour: sp.jour, mois: sp.mois, du: sp.du, au: sp.au, client: customerId }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Forfaits" description="Soldes des clients, ventes et consommations de forfaits."
        actions={<Button asChild variant="secondary"><a href={`/api/export/forfaits${qs ? `?${qs}` : ""}`}><Download />Mouvements (CSV)</a></Button>} />

      <div className="mb-6 space-y-2">
        <PeriodFilter mode={period?.mode ?? null} jour={period?.jour} mois={period?.mois} du={period?.du} au={period?.au} months={lastMonths(24)} today={dayKey()} />
        {client && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Client :</span>
            <Link href={`/clients/${client.id}`} className="font-semibold text-brand">{client.fullName}</Link>
            <Link href={`/forfaits${qs ? `?${qs.replace(/&?client=[^&]+/, "")}` : ""}`} className="inline-flex items-center gap-1 rounded-full border border-line-2 px-2.5 py-1 text-ink-2 hover:bg-subtle"><X className="size-3.5" />Tous les clients</Link>
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Forfaits vendus" value={String(sales.count)} sub={`${formatAmount(sales.amount)} FCFA · ${period ? period.label : "depuis le début"}`} tone="brand" />
        <Stat label="Kilos vendus" value={formatKg(sum("ACHAT"))} sub={client ? client.fullName : "tous les clients"} />
        <Stat label="Kilos consommés" value={formatKg(-sum("CONSO"))} sub={`${moves.filter((m) => m.kind === "CONSO").length} dépôt(s) au kilo`} />
        <Stat label="Solde restant" value={formatKg(totalBalance)} sub={`${withBalance.length} client(s) avec un solde`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <Card>
          <CardHeader title="Mouvements" description={`${moves.length} mouvement(s)${period ? ` · ${period.label}` : ""}, du plus récent au plus ancien`} />
          {moves.length === 0 ? <EmptyState title="Aucun mouvement sur cette période" /> : (
            <ul className="divide-y divide-line border-t border-line">
              {moves.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      <Link href={`/forfaits?${new URLSearchParams({ ...(qs ? Object.fromEntries(new URLSearchParams(qs)) : {}), client: m.customerId })}`} className="hover:text-brand">{m.customerName}</Link>
                      <span className="font-normal text-ink-3"> · {KIND_LABEL[m.kind] ?? m.kind}</span>
                    </p>
                    <p className="truncate text-[13px] text-ink-3 tnum">
                      {formatDateTime(m.at)} · {m.label}
                      {m.orderId && <> · <Link href={`/commandes/${m.orderId}`} className="text-brand">N° {formatOrderNumber(Number(m.orderNumber))}</Link></>}
                      {m.by && ` · ${m.by}`}
                    </p>
                  </div>
                  <span className={cn("shrink-0 font-semibold tnum", m.grams >= 0 ? "text-success" : "text-ink")}>{m.grams >= 0 ? "+" : "−"}{formatKg(Math.abs(m.grams))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Soldes des clients" description="Clients au forfait, dernier mouvement en tête" action={<Scale className="size-4 text-ink-3" />} />
          {balances.length === 0 ? <EmptyState title="Aucun client au forfait">Les forfaits se vendent au dépôt (onglet « Au kilo »).</EmptyState> : (
            <ul className="divide-y divide-line border-t border-line">
              {balances.map((b) => (
                <li key={b.customerId}>
                  <Link href={`/clients/${b.customerId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-canvas">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.fullName}</p>
                      <p className="truncate text-[13px] text-ink-3 tnum">{formatPhone(b.phone)} · acheté {formatKg(b.bought)} · consommé {formatKg(b.used)}</p>
                    </div>
                    <span className={cn("shrink-0 font-semibold tnum", b.balance > 0 ? "text-brand" : "text-ink-3")}>{formatKg(Math.max(0, b.balance))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
