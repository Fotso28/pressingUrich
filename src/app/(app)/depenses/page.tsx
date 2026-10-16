import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TZDate } from "@date-fns/tz";
import { pageAdmin } from "@/server/session";
import { expensesByCategory, listMoneyOut, salaryStaff, salesBetween } from "@/server/queries/finance";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { CategoryBars } from "@/components/charts/category-bars";
import { formatAmount } from "@/lib/domain/money";
import { inTz, TZ } from "@/lib/domain/dates";
import { OUTFLOW_CATEGORY_LABEL } from "@/lib/domain/cash";
import { OutflowActions, MoneyOutTable, SalaryBoard } from "./outflows-ui";

export const metadata = { title: "Dépenses" };

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ mois?: string }> }) {
  await pageAdmin();
  const { mois } = await searchParams;
  const nowZ = inTz(new Date());
  const [y, m] = /^\d{4}-\d{2}$/.test(mois ?? "") ? mois!.split("-").map(Number) : [nowZ.getFullYear(), nowZ.getMonth() + 1];
  const from = new Date(new TZDate(y, m - 1, 1, 0, 0, 0, TZ).getTime());
  const to = new Date(new TZDate(y, m, 1, 0, 0, 0, TZ).getTime());
  const key = (d: Date) => { const z = inTz(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}`; };
  const prev = key(new Date(from.getTime() - 86_400_000));
  const next = key(new Date(to.getTime() + 86_400_000));
  const period = `${y}-${String(m).padStart(2, "0")}`;
  const isCurrent = key(new Date()) === `${y}-${String(m).padStart(2, "0")}`;

  const [sales, cats, moves, staff] = await Promise.all([salesBetween(from, to), expensesByCategory(from, to), listMoneyOut(from, to), salaryStaff()]);
  const totalOut = cats.reduce((s, c) => s + c.total, 0);
  const profit = sales - totalOut;
  const salaries = moves.filter((x) => x.category === "SALAIRES" && !x.voided);

  return (
    <>
      <PageHeader title="Dépenses et sorties d'argent" description="Achats d'intrants, salaires, loyer, énergie… et dépenses de caisse."
        actions={<OutflowActions staff={staff} defaultPeriod={period} />} />

      <div className="mb-6 flex items-center gap-2">
        <Link href={`/depenses?mois=${prev}`} className="grid size-10 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle" aria-label="Mois précédent"><ChevronLeft className="size-4" /></Link>
        <p className="min-w-40 text-center text-[17px] font-semibold capitalize">{MONTHS[m - 1]} {y}</p>
        {!isCurrent && <Link href={`/depenses?mois=${next}`} className="grid size-10 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle" aria-label="Mois suivant"><ChevronRight className="size-4" /></Link>}
        {!isCurrent && <Link href="/depenses" className="ml-2 text-sm font-medium text-brand">Ce mois-ci</Link>}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ventes encaissées" value={formatAmount(sales)} sub="FCFA" />
        <Stat label="Dépenses" value={formatAmount(totalOut)} sub={`FCFA · ${moves.filter((x) => !x.voided).length} sortie(s)`} />
        <Stat label="Bénéfice" value={formatAmount(profit)} sub={sales ? `FCFA · marge ${Math.round((profit / sales) * 100)} %` : "FCFA"} tone={profit >= 0 ? "success" : "danger"} />
        <Stat label="Salaires versés" value={formatAmount(salaries.reduce((s, x) => s + x.amount, 0))} sub={`FCFA · ${salaries.length} paiement(s)`} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Où part l'argent" description="Dépenses du mois par catégorie" />
          <div className="border-t border-line p-5">
            {cats.length ? <CategoryBars data={cats.map((c) => ({ label: OUTFLOW_CATEGORY_LABEL[c.category], total: c.total }))} /> : <EmptyState title="Aucune dépense ce mois-ci" />}
          </div>
        </Card>
        <SalaryBoard staff={staff} period={period} periodLabel={`${MONTHS[m - 1]} ${y}`}
          paid={salaries.map((x) => ({ id: x.id, userId: x.beneficiaryUserId, name: x.beneficiary ?? x.label, amount: x.amount, at: x.at.toISOString() }))} />
      </div>

      <MoneyOutTable rows={moves.map((x) => ({ ...x, at: x.at.toISOString() }))} />
    </>
  );
}
