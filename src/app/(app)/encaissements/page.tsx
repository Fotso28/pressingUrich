import Link from "next/link";
import { format } from "date-fns";
import { pageUser } from "@/server/session";
import { paymentsOfDay } from "@/server/queries/dashboard";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatAmount } from "@/lib/domain/money";
import { inTz } from "@/lib/domain/dates";
import { dayKey, lastMonths, resolvePeriod, type PeriodParams } from "@/lib/domain/period";
import { PeriodFilter } from "@/components/filters/period-filter";
import { METHOD_LABEL, METHODS } from "@/lib/domain/cash";
import { cn } from "@/lib/cn";
import { formatOrderNumber } from "@/lib/domain/order-number";

export const metadata = { title: "Encaissements" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const user = await pageUser();
  const sp = await searchParams;
  const today = dayKey();
  // Par défaut : la journée en cours. Filtres : un jour, un mois, une période personnalisée.
  const period = resolvePeriod(sp, "jour")!;
  const isAdmin = user.role === "ADMIN";
  // Le gérant voit tous les encaissements ; un agent, seulement les siens.
  const list = await paymentsOfDay(period.from, period.to, isAdmin ? undefined : user.id);
  const multiDay = period.mode !== "jour";
  const valid = list.filter((p) => !p.voided);
  const total = valid.reduce((a, p) => a + p.amount, 0);
  const byMethod = Object.fromEntries(METHODS.map((mm) => [mm, valid.filter((p) => p.method === mm).reduce((a, p) => a + p.amount, 0)]));
  const agents = isAdmin ? [...new Set(valid.map((p) => p.agent ?? "—"))].map((a) => ({ name: a, total: valid.filter((p) => (p.agent ?? "—") === a).reduce((s, p) => s + p.amount, 0) })) : [];

  return (
    <>
      <PageHeader title="Encaissements" description={isAdmin ? "Tous les paiements reçus au comptoir, toutes caisses confondues." : "Les paiements que vous avez encaissés."} />
      <div className="mb-6 space-y-2">
        <PeriodFilter mode={period.mode} jour={period.jour} mois={period.mois} du={period.du} au={period.au} months={lastMonths(24)} today={today} allowAll={false} />
        <p className="text-[17px] font-semibold first-letter:uppercase">{period.label}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Total encaissé" value={formatAmount(total)} sub={`FCFA · ${valid.length} paiement(s)`} tone="brand" />
        {METHODS.map((mm) => <Stat key={mm} label={METHOD_LABEL[mm]} value={formatAmount(byMethod[mm])} sub="FCFA" />)}
      </div>

      {agents.length > 1 && (
        <Card className="mb-6">
          <CardHeader title="Par agent" />
          <ul className="divide-y divide-line border-t border-line">
            {agents.map((a) => <li key={a.name} className="flex items-center justify-between px-5 py-3"><span className="font-medium">{a.name}</span><Money value={a.total} strong /></li>)}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Détail des paiements" description={list.length ? `${list.length} ligne(s), du plus récent au plus ancien` : undefined} />
        {list.length === 0 ? (
          <EmptyState title="Aucun encaissement">{period.mode === "jour" && period.jour === today ? "Les paiements apparaîtront ici dès le premier encaissement de la journée." : "Aucun paiement sur cette période."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/commandes/${p.orderId}`} className={cn("flex items-center gap-4 px-5 py-3 hover:bg-canvas", p.voided && "opacity-55")}>
                  <span className={cn("shrink-0 text-[13px] text-ink-3 tnum", multiDay ? "w-[4.5rem]" : "w-12")}>{format(inTz(p.at), multiDay ? "dd/MM HH:mm" : "HH:mm")}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-medium", p.voided && "line-through")}>N° {formatOrderNumber(p.orderNumber)} · {p.customer}</p>
                    <p className="truncate text-[13px] text-ink-3">{METHOD_LABEL[p.method]}{p.reference && ` · ${p.reference}`}{isAdmin && p.agent && ` · ${p.agent}`}{p.voided && p.voidReason && ` · annulé : ${p.voidReason}`}</p>
                  </div>
                  {p.voided && <Badge className="hidden bg-danger-50 text-danger ring-danger/20 sm:inline-flex">Annulé</Badge>}
                  <Money value={p.amount} strong className={cn(p.voided && "line-through")} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
