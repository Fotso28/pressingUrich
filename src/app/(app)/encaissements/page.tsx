import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { pageUser } from "@/server/session";
import { paymentsOfDay } from "@/server/queries/dashboard";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatAmount } from "@/lib/domain/money";
import { inTz, TZ } from "@/lib/domain/dates";
import { METHOD_LABEL, METHODS } from "@/lib/domain/cash";
import { cn } from "@/lib/cn";
import { formatOrderNumber } from "@/lib/domain/order-number";

export const metadata = { title: "Encaissements du jour" };

const key = (d: Date) => { const z = inTz(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`; };

export default async function DayPaymentsPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const user = await pageUser();
  const { jour } = await searchParams;
  const today = key(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(jour ?? "") && jour! <= today ? jour! : today;
  const [y, m, d] = day.split("-").map(Number);
  const from = new Date(new TZDate(y, m - 1, d, 0, 0, 0, TZ).getTime());
  const to = new Date(new TZDate(y, m - 1, d + 1, 0, 0, 0, TZ).getTime());
  const prev = key(new Date(from.getTime() - 12 * 3_600_000));
  const next = key(new Date(to.getTime() + 12 * 3_600_000));
  const isAdmin = user.role === "ADMIN";
  // Le gérant voit tous les encaissements ; un agent, seulement les siens.
  const list = await paymentsOfDay(from, to, isAdmin ? undefined : user.id);
  const valid = list.filter((p) => !p.voided);
  const total = valid.reduce((a, p) => a + p.amount, 0);
  const byMethod = Object.fromEntries(METHODS.map((mm) => [mm, valid.filter((p) => p.method === mm).reduce((a, p) => a + p.amount, 0)]));
  const agents = isAdmin ? [...new Set(valid.map((p) => p.agent ?? "—"))].map((a) => ({ name: a, total: valid.filter((p) => (p.agent ?? "—") === a).reduce((s, p) => s + p.amount, 0) })) : [];
  const title = day === today ? "Aujourd'hui" : format(from, "EEEE d MMMM yyyy", { locale: fr });

  return (
    <>
      <PageHeader title="Encaissements du jour" description={isAdmin ? "Tous les paiements reçus au comptoir, toutes caisses confondues." : "Les paiements que vous avez encaissés."} />
      <div className="mb-6 flex items-center gap-2">
        <Link href={`/encaissements?jour=${prev}`} className="grid size-10 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle" aria-label="Jour précédent"><ChevronLeft className="size-4" /></Link>
        <p className="min-w-48 text-center text-[17px] font-semibold first-letter:uppercase">{title}</p>
        {day !== today && <Link href={`/encaissements?jour=${next}`} className="grid size-10 place-items-center rounded-md border border-line-2 bg-surface text-ink-2 hover:bg-subtle" aria-label="Jour suivant"><ChevronRight className="size-4" /></Link>}
        {day !== today && <Link href="/encaissements" className="ml-2 text-sm font-medium text-brand">Aujourd&apos;hui</Link>}
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
          <EmptyState title="Aucun encaissement">{day === today ? "Les paiements apparaîtront ici dès le premier encaissement de la journée." : "Aucun paiement ce jour-là."}</EmptyState>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/commandes/${p.orderId}`} className={cn("flex items-center gap-4 px-5 py-3 hover:bg-canvas", p.voided && "opacity-55")}>
                  <span className="w-12 shrink-0 text-[13px] text-ink-3 tnum">{format(inTz(p.at), "HH:mm")}</span>
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
