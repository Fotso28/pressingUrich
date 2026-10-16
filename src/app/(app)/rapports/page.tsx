import Link from "next/link";
import { Download } from "lucide-react";
import { pageAdmin } from "@/server/session";
import { abandonedOrders, getManagerDashboard, revenueByMethod, unpaidOrders } from "@/server/queries/dashboard";
import { availableMonths, expensesByCategory, monthBounds, monthlyFinance, salesBetween } from "@/server/queries/finance";
import { listClosedSessions, listSessionsFiltered } from "@/server/queries/cash";
import { MonthPicker } from "@/components/filters/month-picker";
import { monthLabel } from "@/lib/domain/dates";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { FinanceChart } from "@/components/charts/finance-chart";
import { CategoryBars } from "@/components/charts/category-bars";
import { OrderListCompact } from "@/components/orders/order-list-compact";
import { formatAmount } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/domain/dates";
import { METHOD_LABEL, METHODS, OUTFLOW_CATEGORY_LABEL } from "@/lib/domain/cash";
import { cn } from "@/lib/cn";

export const metadata = { title: "Rapports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  await pageAdmin();
  const { mois } = await searchParams;
  const available = await availableMonths();
  // Filtre : un mois précis, ou par défaut les 12 derniers mois.
  const month = mois && available.includes(mois) ? mois : null;
  const range = month ? monthBounds(month) : null;
  const [d, months, unpaid, abandoned, closures] = await Promise.all([
    getManagerDashboard(), monthlyFinance(12), unpaidOrders(50), abandonedOrders(50),
    range ? listSessionsFiltered(range) : listClosedSessions(30),
  ]);
  const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const ml = (k: string) => `${MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;

  let cats: Awaited<ReturnType<typeof expensesByCategory>>;
  let tot: { sales: number; expenses: number; profit: number };
  let periods: { k: string; label: string; v: Awaited<ReturnType<typeof revenueByMethod>> }[];
  if (range) {
    // Semaines du mois choisi (du lundi au dimanche, bornées au mois).
    const weeks: { from: Date; to: Date }[] = [];
    for (let a = range.from; a < range.to;) {
      const dow = (new Date(a.getTime() + 3_600_000).getUTCDay() + 6) % 7; // Douala = UTC+1
      const b = new Date(Math.min(range.to.getTime(), a.getTime() + (7 - dow) * 86_400_000));
      weeks.push({ from: a, to: b }); a = b;
    }
    const [c, sales, byWeek, all] = await Promise.all([
      expensesByCategory(range.from, range.to), salesBetween(range.from, range.to),
      Promise.all(weeks.map((w) => revenueByMethod(w.from, w.to))), revenueByMethod(range.from, range.to),
    ]);
    cats = c;
    const expenses = c.reduce((a, x) => a + x.total, 0);
    tot = { sales, expenses, profit: sales - expenses };
    const dm = (x: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Douala", day: "numeric", month: "short" }).format(x);
    periods = [...weeks.map((w, i) => ({ k: `w${i}`, label: `Du ${dm(w.from)} au ${dm(new Date(w.to.getTime() - 1))}`, v: byWeek[i] })), { k: "all", label: "Total du mois", v: all }];
  } else {
    cats = months.length ? await expensesByCategory(new Date(`${months[0].month}-01T00:00:00+01:00`), new Date()) : [];
    tot = months.reduce((a, m) => ({ sales: a.sales + m.sales, expenses: a.expenses + m.expenses, profit: a.profit + m.profit }), { sales: 0, expenses: 0, profit: 0 });
    periods = [{ k: "day", label: "Aujourd'hui", v: d.day }, { k: "week", label: "Cette semaine", v: d.week }, { k: "month", label: "Ce mois", v: d.month }];
  }
  const scope = month ? monthLabel(month) : `${months.length} mois`;
  return (
    <>
      <PageHeader title="Rapports" description="Ventes, dépenses, bénéfice, impayés, commandes en souffrance, clôtures."
        actions={<>
          <Button asChild variant="secondary"><a href={`/api/export/commandes${month ? `?mois=${month}` : ""}`}><Download />Commandes (CSV)</a></Button>
          <Button asChild variant="secondary"><a href={`/api/export/paiements${month ? `?mois=${month}` : ""}`}><Download />Paiements (CSV)</a></Button>
          <Button asChild variant="secondary"><a href={`/api/export/sorties${month ? `?mois=${month}` : ""}`}><Download />Dépenses (CSV)</a></Button>
        </>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <MonthPicker months={available} value={month} allLabel="12 derniers mois" className="w-full sm:w-auto" />
        {month && <a href="/rapports" className="text-sm font-medium text-brand">Voir les 12 derniers mois</a>}
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader title="Chiffre d'affaires encaissé" description={month ? `Semaine par semaine · ${monthLabel(month)}` : "Par période et par mode de paiement, hors paiements annulés"} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-[14.5px]">
            <thead><tr className="text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3"><th className="px-5 py-2.5">Période</th>{METHODS.map((m) => <th key={m} className="px-3 py-2.5 text-right">{METHOD_LABEL[m]}</th>)}<th className="px-5 py-2.5 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {periods.map((p) => (
                <tr key={p.k} className={cn(p.k === "all" && "bg-canvas/70 font-semibold")}>
                  <td className="px-5 py-3 font-medium">{p.label}</td>
                  {METHODS.map((m) => <td key={m} className="px-3 py-3 text-right"><Money value={p.v[m]} unit={false} className="text-ink-2" /></td>)}
                  <td className="px-5 py-3 text-right"><Money value={p.v.total} strong /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={`Ventes · ${scope}`} value={formatAmount(tot.sales)} sub={month ? "FCFA encaissés" : `FCFA · moyenne ${formatAmount(Math.round(tot.sales / Math.max(1, months.length)))} / mois`} tone="brand" />
        <Stat label={`Dépenses · ${scope}`} value={formatAmount(tot.expenses)} sub="FCFA · caisse + sorties (intrants, salaires…)" />
        <Stat label={`Bénéfice · ${scope}`} value={formatAmount(tot.profit)} sub={tot.sales ? `FCFA · marge ${Math.round((tot.profit / tot.sales) * 100)} %` : "FCFA"} tone={tot.profit >= 0 ? "success" : "danger"} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Ventes, dépenses et bénéfice" description="Par mois, en FCFA" />
          <div className="border-t border-line px-4 pb-4 pt-5 sm:px-5">
            {months.length ? <FinanceChart data={months} /> : <EmptyState title="Pas encore de données" />}
          </div>
          <details className="border-t border-line">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-ink-2 hover:text-ink">Voir le tableau des valeurs</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead><tr className="text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3"><th className="px-5 py-2">Mois</th><th className="px-3 py-2 text-right">Ventes</th><th className="px-3 py-2 text-right">Dép. caisse</th><th className="px-3 py-2 text-right">Sorties</th><th className="px-3 py-2 text-right">dont salaires</th><th className="px-5 py-2 text-right">Bénéfice</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {months.map((m) => (
                    <tr key={m.month}>
                      <td className="px-5 py-2 capitalize">{ml(m.month)}</td>
                      <td className="px-3 py-2 text-right"><Money value={m.sales} unit={false} /></td>
                      <td className="px-3 py-2 text-right"><Money value={m.cashExpenses} unit={false} className="text-ink-2" /></td>
                      <td className="px-3 py-2 text-right"><Money value={m.outflows} unit={false} className="text-ink-2" /></td>
                      <td className="px-3 py-2 text-right"><Money value={m.salaries} unit={false} className="text-ink-3" /></td>
                      <td className={cn("px-5 py-2 text-right font-semibold", m.profit < 0 && "text-danger")}><Money value={m.profit} unit={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Card>
        <Card>
          <CardHeader title="Répartition des dépenses" description={month ? monthLabel(month) : `${months.length} derniers mois`} action={<Link href="/depenses" className="text-sm font-medium text-brand">Dépenses</Link>} />
          <div className="border-t border-line p-5">
            {cats.length ? <CategoryBars data={cats.map((c) => ({ label: OUTFLOW_CATEGORY_LABEL[c.category], total: c.total }))} /> : <EmptyState title="Aucune dépense" />}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Impayés (à ce jour)" value={formatAmount(d.counters.unpaidSum)} sub={`FCFA sur ${d.counters.unpaidCount} commande(s)`} tone={d.counters.unpaidSum ? "warning" : undefined} />
        <Stat label="En souffrance" value={d.counters.abandoned} sub={`Prêtes depuis plus de ${d.counters.abandonedAfterDays} jours`} tone={d.counters.abandoned ? "danger" : undefined} />
        <Stat label="En retard" value={d.counters.late} sub="Date prévue dépassée, non prêtes" tone={d.counters.late ? "danger" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card id="impayes">
          <CardHeader title="Commandes impayées" description="Triées par montant restant" />
          {unpaid.length ? <OrderListCompact orders={unpaid} show="remaining" /> : <EmptyState title="Aucun impayé" />}
        </Card>
        <Card id="souffrance">
          <CardHeader title="Commandes en souffrance" description="Prêtes et non retirées depuis longtemps" />
          {abandoned.length ? <OrderListCompact orders={abandoned} show="ready" /> : <EmptyState title="Aucune commande en souffrance" />}
        </Card>
      </div>

      <Card id="clotures" className="mt-6">
        <CardHeader title="Historique des clôtures" description={month ? `${closures.length} clôture(s) · ${monthLabel(month)}` : "30 dernières clôtures"} />
        {closures.length === 0 ? <EmptyState title="Aucune clôture" /> : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-[14.5px]">
              <thead><tr className="text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3"><th className="px-5 py-2.5">Clôturée</th><th className="px-3 py-2.5">Agent</th><th className="px-3 py-2.5 text-right">Attendu</th><th className="px-3 py-2.5 text-right">Compté</th><th className="px-3 py-2.5 text-right">Écart</th><th className="px-5 py-2.5">Commentaire</th></tr></thead>
              <tbody className="divide-y divide-line">
                {closures.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas">
                    <td className="px-5 py-3 tnum"><Link href={`/caisse/${c.id}`} className="font-medium hover:text-brand">{c.closedAt && formatDateTime(c.closedAt)}</Link></td>
                    <td className="px-3 py-3">{c.userName}</td>
                    <td className="px-3 py-3 text-right"><Money value={c.expected} unit={false} /></td>
                    <td className="px-3 py-3 text-right"><Money value={c.counted} unit={false} /></td>
                    <td className={cn("px-3 py-3 text-right font-semibold tnum", c.difference === 0 ? "text-success" : "text-danger")}>{c.difference === 0 ? "0" : <Money value={c.difference} unit={false} />}</td>
                    <td className="max-w-[280px] truncate px-5 py-3 text-ink-2">{c.comment ?? <span className="text-ink-3">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
