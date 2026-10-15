import Link from "next/link";
import { PackagePlus, PackageCheck, Wallet, AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { pageUser } from "@/server/session";
import { getOpenCashSession, listClosedSessions } from "@/server/queries/cash";
import { getCounters, getManagerDashboard, lateOrders, todaysOrders } from "@/server/queries/dashboard";
import { monthlyFinance } from "@/server/queries/finance";
import { FinanceChart } from "@/components/charts/finance-chart";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui/card";
import { OpenCashCard } from "@/components/cash/open-cash-card";
import { OrderListCompact } from "@/components/orders/order-list-compact";
import { Money } from "@/components/money";
import { formatAmount } from "@/lib/domain/money";
import { formatDateTime, inTz } from "@/lib/domain/dates";
import { METHOD_LABEL, METHODS } from "@/lib/domain/cash";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const metadata = { title: "Accueil" };

function Greeting({ name }: { name: string }) {
  const h = inTz(new Date()).getHours();
  const hello = h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const date = format(inTz(new Date()), "EEEE d MMMM", { locale: fr });
  return (
    <div className="mb-6">
      <p className="text-sm text-ink-3 first-letter:uppercase">{date}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.01em]">{hello}, {name.split(" ")[0]}</h1>
    </div>
  );
}

function ActionTiles() {
  const tiles = [
    { href: "/depot/nouveau", label: "Nouveau dépôt", sub: "Client, articles, ticket", icon: PackagePlus, primary: true },
    { href: "/commandes?tab=pretes", label: "Retrait", sub: "Remettre une commande prête", icon: PackageCheck },
    { href: "/caisse", label: "Ma caisse", sub: "Encaissements, dépenses, clôture", icon: Wallet },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <Link key={t.href} href={t.href}
          className={t.primary
            ? "group flex items-center gap-4 rounded-lg bg-brand p-5 text-white shadow-[0_8px_20px_-10px_rgb(47_71_151/0.7)] transition hover:bg-brand-600"
            : "group flex items-center gap-4 rounded-lg border border-line bg-surface p-5 shadow-card transition hover:border-line-2"}>
          <span className={t.primary ? "grid size-12 place-items-center rounded-lg bg-white/15" : "grid size-12 place-items-center rounded-lg bg-brand-50 text-brand"}>
            <t.icon className="size-6" />
          </span>
          <span>
            <span className="block text-[17px] font-semibold">{t.label}</span>
            <span className={t.primary ? "text-sm text-white/75" : "text-sm text-ink-3"}>{t.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ refus?: string }> }) {
  const user = await pageUser();
  const { refus } = await searchParams;
  const session = await getOpenCashSession(user.id);
  const refused = refus && (
    <div className="mb-5 flex items-center gap-2 rounded-md bg-warning-50 px-4 py-3 text-sm text-[#8a5300]">
      <AlertCircle className="size-4" /> Cette page est réservée au gérant.
    </div>
  );

  if (user.role === "ADMIN") {
    const [d, late, gaps, fin] = await Promise.all([getManagerDashboard(), lateOrders(6), listClosedSessions(5, true), monthlyFinance(6)]);
    const cur = fin[fin.length - 1];
    return (
      <>
        {refused}
        <Greeting name={user.name} />
        {!session && <div className="mb-6"><OpenCashCard compact /></div>}
        <div className="mb-6"><ActionTiles /></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="CA du jour" value={formatAmount(d.day.total)} sub="FCFA encaissés" tone="brand" />
          <Stat label="CA de la semaine" value={formatAmount(d.week.total)} sub="FCFA depuis lundi" />
          <Stat label="CA du mois" value={formatAmount(d.month.total)} sub="FCFA ce mois-ci" />
          <Stat label="Impayés" value={formatAmount(d.counters.unpaidSum)} sub={`${d.counters.unpaidCount} cmd · ${d.counters.abandoned} en souffrance`} tone={d.counters.unpaidSum ? "warning" : undefined} href="/rapports#impayes" />
          <Stat label="Bénéfice du mois" value={formatAmount(cur?.profit ?? 0)} sub={`FCFA · dépenses ${formatAmount(cur?.expenses ?? 0)}`} tone={(cur?.profit ?? 0) >= 0 ? "success" : "danger"} href="/depenses" />
        </div>
        <Card className="mt-6">
          <CardHeader title="Ventes, dépenses et bénéfice" description="6 derniers mois, en FCFA" action={<Link href="/rapports" className="text-sm font-medium text-brand">Rapports</Link>} />
          <div className="border-t border-line px-4 pb-4 pt-5 sm:px-5"><FinanceChart data={fin} height={220} /></div>
        </Card>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-1">
            <CardHeader title="Encaissements du jour" description="Par mode de paiement" />
            <ul className="divide-y divide-line px-5 pb-2">
              {METHODS.map((m) => (
                <li key={m} className="flex items-center justify-between py-3">
                  <span className="flex items-center gap-2.5 text-[14.5px]"><MethodDot m={m} />{METHOD_LABEL[m]}</span>
                  <Money value={d.day[m]} strong />
                </li>
              ))}
              <li className="flex items-center justify-between py-3">
                <span className="font-semibold">Total</span><Money value={d.day.total} strong className="text-brand" />
              </li>
            </ul>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Compteurs atelier" />
            <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
              <Counter href="/commandes?tab=a-traiter" label="En cours" value={d.counters.inProgress} />
              <Counter href="/commandes?tab=pretes" label="Prêtes non retirées" value={d.counters.ready} />
              <Counter href="/commandes?tab=a-traiter&retard=1" label="En retard" value={d.counters.late} danger />
            </div>
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="Commandes en retard" action={<Link href="/commandes?tab=a-traiter&retard=1" className="text-sm font-medium text-brand">Tout voir</Link>} />
            {late.length ? <OrderListCompact orders={late} /> : <EmptyState icon={<CheckCircle2 />} title="Aucun retard" />}
          </Card>
          <Card>
            <CardHeader title="Clôtures avec écart" action={<Link href="/rapports#clotures" className="text-sm font-medium text-brand">Historique</Link>} />
            {gaps.length ? (
              <ul className="divide-y divide-line">
                {gaps.map((g) => (
                  <li key={g.id}>
                    <Link href={`/caisse/${g.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-canvas">
                      <div>
                        <p className="text-[14.5px] font-medium">{g.userName}</p>
                        <p className="text-[13px] text-ink-3 tnum">{g.closedAt && formatDateTime(g.closedAt)}</p>
                      </div>
                      <Money value={g.difference} strong className={g.difference < 0 ? "text-danger" : "text-warning"} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={<CheckCircle2 />} title="Aucun écart récent" />}
          </Card>
        </div>
      </>
    );
  }

  const [c, today] = await Promise.all([getCounters(), todaysOrders(10)]);
  return (
    <>
      {refused}
      <Greeting name={user.name} />
      {!session && <div className="mb-6"><OpenCashCard /></div>}
      <ActionTiles />
      <div className="mt-6 grid grid-cols-3 gap-3">
        <CounterCard href="/commandes?tab=a-traiter" label="À traiter" value={c.inProgress} />
        <CounterCard href="/commandes?tab=pretes" label="Prêtes" value={c.ready} tone="success" />
        <CounterCard href="/commandes?tab=a-traiter&retard=1" label="En retard" value={c.late} tone={c.late ? "danger" : undefined} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Dépôts du jour" description="Les 10 derniers" action={<Link href="/commandes?tab=toutes" className="text-sm font-medium text-brand">Toutes les commandes</Link>} />
        {today.length ? <OrderListCompact orders={today} show="created" /> : <EmptyState icon={<Inbox />} title="Aucun dépôt aujourd'hui">Les nouveaux dépôts apparaîtront ici.</EmptyState>}
      </Card>
    </>
  );
}

function Counter({ href, label, value, danger }: { href: string; label: string; value: number; danger?: boolean }) {
  return (
    <Link href={href} className="bg-surface px-5 py-5 transition hover:bg-canvas">
      <p className={`text-3xl font-semibold tnum ${danger && value ? "text-danger" : ""}`}>{value}</p>
      <p className="mt-1 text-sm text-ink-3">{label}</p>
    </Link>
  );
}

function CounterCard({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "danger" | "success" }) {
  const cls = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-ink";
  return (
    <Link href={href} className="rounded-lg border border-line bg-surface p-4 shadow-card transition hover:border-line-2 sm:p-5">
      <p className={`text-[28px] leading-none font-semibold tnum ${cls}`}>{value}</p>
      <p className="mt-2 text-sm text-ink-3">{label}</p>
    </Link>
  );
}

function MethodDot({ m }: { m: string }) {
  const c = m === "ESPECES" ? "bg-[#4a5468]" : m === "MTN_MOMO" ? "bg-[#f2c200]" : "bg-[#ff7900]";
  return <span className={`size-2.5 rounded-full ${c}`} />;
}
