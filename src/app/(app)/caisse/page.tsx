import Link from "next/link";
import { History } from "lucide-react";
import { pageUser } from "@/server/session";
import { getCashSessionSummary, getOpenCashSession, listCashiers, listOpenSessions, listSessionsFiltered } from "@/server/queries/cash";
import { availableMonths, monthBounds } from "@/server/queries/finance";
import { MonthPicker, ParamSelect } from "@/components/filters/month-picker";
import { monthLabel } from "@/lib/domain/dates";
import { EmptyState } from "@/components/ui/card";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { OpenCashCard } from "@/components/cash/open-cash-card";
import { Money } from "@/components/money";
import { formatDateTime } from "@/lib/domain/dates";
import { CashSessionView } from "./cash-session-view";
import { cn } from "@/lib/cn";

export const metadata = { title: "Caisse" };

export default async function CashPage({ searchParams }: { searchParams: Promise<{ mois?: string; agent?: string; ecart?: string }> }) {
  const user = await pageUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const open = await getOpenCashSession(user.id);
  const summary = open ? await getCashSessionSummary(open.id) : null;
  const months = await availableMonths();
  const month = sp.mois && months.includes(sp.mois) ? sp.mois : months[0];
  const { from, to } = monthBounds(month);
  // Un agent ne voit que ses propres caisses.
  const agentId = isAdmin ? (sp.agent || undefined) : user.id;
  const onlyGaps = sp.ecart === "1";
  const [history, others, cashiers] = await Promise.all([
    listSessionsFiltered({ from, to, userId: agentId, onlyGaps }),
    isAdmin ? listOpenSessions() : Promise.resolve([]),
    isAdmin ? listCashiers() : Promise.resolve([]),
  ]);
  const totals = history.reduce((a, s) => ({ received: a.received + s.received, difference: a.difference + s.difference, gaps: a.gaps + (s.difference !== 0 ? 1 : 0) }), { received: 0, difference: 0, gaps: 0 });
  return (
    <>
      <PageHeader title="Caisse" description={open ? `Ouverte le ${formatDateTime(open.openedAt)}` : "Aucune caisse ouverte"} />
      {!summary ? <OpenCashCard /> : (
        <CashSessionView
          isAdmin={isAdmin}
          summary={{
            openingFloat: summary.session.openingFloat,
            rows: summary.rows,
            payments: summary.payments.map(({ p, orderNumber, customerName }) => ({ id: p.id, orderId: p.orderId, orderNumber, customerName, method: p.method, amount: p.amount, createdAt: p.createdAt.toISOString(), voided: !!p.voidedAt })),
            expenses: summary.expenses.map((e) => ({ id: e.id, label: e.label, category: e.category, method: e.method, amount: e.amount, createdAt: e.createdAt.toISOString(), voided: !!e.voidedAt, voidReason: e.voidReason })),
          }}
        />
      )}
      <div className="mt-8 grid gap-6">
        {others.length > 0 && (
          <Card>
            <CardHeader title="Caisses ouvertes" description="Tous les postes" />
            <ul className="divide-y divide-line border-t border-line">
              {others.map((s) => (
                <li key={s.id}><Link href={`/caisse/${s.id}`} className="flex justify-between px-5 py-3 hover:bg-canvas"><span className="font-medium">{s.userName}</span><span className="text-sm text-ink-3 tnum">depuis {formatDateTime(s.openedAt)}</span></Link></li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card className="mt-6">
        <CardHeader title="Historique des caisses" description={`${history.length} caisse(s) clôturée(s) · ${monthLabel(month)}`} action={<History className="size-4 text-ink-3" />} />
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <MonthPicker months={months} value={month} className="w-full sm:w-auto" />
          {isAdmin && (
            <ParamSelect param="agent" value={sp.agent ?? ""} label="Agent" className="min-w-0 flex-1 sm:flex-none"
              options={[{ value: "", label: "Tous les agents" }, ...cashiers.map((c) => ({ value: c.id, label: c.name }))]} />
          )}
          <ParamSelect param="ecart" value={onlyGaps ? "1" : ""} label="Écart" className="min-w-0 flex-1 sm:flex-none"
            options={[{ value: "", label: "Toutes les clôtures" }, { value: "1", label: "Avec écart seulement" }]} />
        </div>
        {history.length > 0 && (
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
            <div className="px-3 py-3"><p className="text-[12px] text-ink-3">Encaissé</p><Money value={totals.received} strong /></div>
            <div className="px-3 py-3"><p className="text-[12px] text-ink-3">Avec écart</p><p className="font-semibold tnum">{totals.gaps}</p></div>
            <div className="px-3 py-3"><p className="text-[12px] text-ink-3">Écart cumulé</p><Money value={totals.difference} strong className={totals.difference ? "text-danger" : "text-success"} /></div>
          </div>
        )}
        {history.length === 0 ? <EmptyState title="Aucune caisse clôturée">Changez de mois ou de filtre.</EmptyState> : (
          <ul className="divide-y divide-line border-t border-line">
            {history.map((s) => (
              <li key={s.id}>
                <Link href={`/caisse/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.userName}</p>
                    <p className="text-[13px] text-ink-3 tnum">{formatDateTime(s.openedAt)} · encaissé <Money value={s.received} unit={false} /></p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={s.counted} strong />
                    <p className={cn("text-[12.5px] tnum", s.difference === 0 ? "text-success" : "text-danger")}>{s.difference === 0 ? "Sans écart" : <>Écart <Money value={s.difference} unit={false} /></>}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
