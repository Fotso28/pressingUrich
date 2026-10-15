import Link from "next/link";
import { History } from "lucide-react";
import { pageUser } from "@/server/session";
import { getCashSessionSummary, getOpenCashSession, listClosedSessions, listOpenSessions } from "@/server/queries/cash";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { OpenCashCard } from "@/components/cash/open-cash-card";
import { Money } from "@/components/money";
import { formatDateTime } from "@/lib/domain/dates";
import { CashSessionView } from "./cash-session-view";
import { cn } from "@/lib/cn";

export const metadata = { title: "Caisse" };

export default async function CashPage() {
  const user = await pageUser();
  const open = await getOpenCashSession(user.id);
  const summary = open ? await getCashSessionSummary(open.id) : null;
  const [mine, others] = await Promise.all([
    listClosedSessions(8).then((l) => (user.role === "ADMIN" ? l : l.filter((x) => x.userName === user.name))),
    user.role === "ADMIN" ? listOpenSessions() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Caisse" description={open ? `Ouverte le ${formatDateTime(open.openedAt)}` : "Aucune caisse ouverte"} />
      {!summary ? <OpenCashCard /> : (
        <CashSessionView
          isAdmin={user.role === "ADMIN"}
          summary={{
            openingFloat: summary.session.openingFloat,
            rows: summary.rows,
            payments: summary.payments.map(({ p, orderNumber, customerName }) => ({ id: p.id, orderId: p.orderId, orderNumber, customerName, method: p.method, amount: p.amount, createdAt: p.createdAt.toISOString(), voided: !!p.voidedAt })),
            expenses: summary.expenses.map((e) => ({ id: e.id, label: e.label, category: e.category, method: e.method, amount: e.amount, createdAt: e.createdAt.toISOString(), voided: !!e.voidedAt, voidReason: e.voidReason })),
          }}
        />
      )}
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
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
        <Card className={cn(others.length === 0 && "xl:col-span-2")}>
          <CardHeader title="Dernières clôtures" action={<History className="size-4 text-ink-3" />} />
          {mine.length === 0 ? <p className="border-t border-line px-5 py-6 text-sm text-ink-3">Aucune clôture pour l&apos;instant.</p> : (
            <ul className="divide-y divide-line border-t border-line">
              {mine.map((s) => (
                <li key={s.id}>
                  <Link href={`/caisse/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                    <div>
                      <p className="font-medium">{s.userName}</p>
                      <p className="text-[13px] text-ink-3 tnum">{s.closedAt && formatDateTime(s.closedAt)}</p>
                    </div>
                    <div className="text-right">
                      <Money value={s.counted} strong />
                      <p className={cn("text-[12.5px] tnum", s.difference === 0 ? "text-success" : "text-danger")}>{s.difference === 0 ? "Sans écart" : <>Écart <Money value={s.difference} unit={false} /></>}</p>
                    </div>
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
