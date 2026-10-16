import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { pageUser } from "@/server/session";
import { getCashSessionSummary } from "@/server/queries/cash";
import { Card, CardHeader } from "@/components/ui/card";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/components/money";
import { METHOD_LABEL } from "@/lib/domain/cash";
import { formatDateTime } from "@/lib/domain/dates";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { cn } from "@/lib/cn";

export default async function CashSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cloture?: string }> }) {
  const user = await pageUser();
  const { id } = await params;
  const { cloture } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await getCashSessionSummary(id);
  if (!s) notFound();
  if (user.role !== "ADMIN" && s.session.userId !== user.id) redirect("/caisse");
  const closed = s.session.status === "FERMEE";
  return (
    <>
      <Link href="/caisse" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-3 hover:text-ink"><ArrowLeft className="size-4" />Caisse</Link>
      {cloture && <div className="mb-5 flex items-center gap-2 rounded-lg bg-success-50 px-4 py-3 text-sm font-medium text-[#12813c]"><CheckCircle2 className="size-4" />Caisse clôturée.</div>}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em]">Session de caisse · {s.userName}</h1>
          <p className="mt-1 text-[15px] text-ink-3 tnum">Ouverte le {formatDateTime(s.session.openedAt)}{s.session.closedAt && ` · clôturée le ${formatDateTime(s.session.closedAt)}`}</p>
        </div>
        {closed && <PrintButton href={`/print/caisse/${s.session.id}`}>Imprimer le récapitulatif</PrintButton>}
      </div>
      <Card>
        <CardHeader title={closed ? "Clôture" : "Situation"} description={`Fond de caisse : ${s.session.openingFloat.toLocaleString("fr-FR")} FCFA`} />
        <div className="overflow-x-auto border-t border-line">
        <table className="w-full text-[14.5px]">
          <thead><tr className="text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3"><th className="px-5 py-2.5">Mode</th><th className="px-3 py-2.5 text-right">Attendu</th>{closed && <><th className="px-3 py-2.5 text-right">Compté</th><th className="px-5 py-2.5 text-right">Écart</th></>}</tr></thead>
          <tbody className="divide-y divide-line">
            {s.rows.map((r) => {
              const c = s.counts.find((k) => k.method === r.method);
              return (
                <tr key={r.method}>
                  <td className="px-5 py-3 font-medium">{METHOD_LABEL[r.method]}</td>
                  <td className="px-3 py-3 text-right"><Money value={c?.expected ?? r.expected} /></td>
                  {closed && <><td className="px-3 py-3 text-right"><Money value={c?.counted ?? 0} strong /></td>
                    <td className={cn("px-5 py-3 text-right font-semibold tnum", (c?.difference ?? 0) === 0 ? "text-success" : "text-danger")}>{(c?.difference ?? 0) === 0 ? "0" : <Money value={c!.difference} unit={false} />}</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {s.session.closingComment && <p className="border-t border-line px-5 py-3 text-sm text-ink-2"><span className="font-medium text-ink">Commentaire :</span> {s.session.closingComment}</p>}
      </Card>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Encaissements" description={`${s.payments.length}`} />
          <ul className="divide-y divide-line border-t border-line">
            {s.payments.map(({ p, orderNumber, customerName }) => (
              <li key={p.id} className={cn("flex justify-between gap-3 px-5 py-2.5 text-sm", p.voidedAt && "opacity-50 line-through")}>
                <Link href={`/commandes/${p.orderId}`} className="hover:text-brand">N° {formatOrderNumber(orderNumber)} · {customerName} <span className="text-ink-3">· {METHOD_LABEL[p.method]}</span></Link>
                <Money value={p.amount} strong />
              </li>
            ))}
            {!s.payments.length && <li className="px-5 py-4 text-sm text-ink-3">Aucun encaissement.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Dépenses" description={`${s.expenses.length}`} />
          <ul className="divide-y divide-line border-t border-line">
            {s.expenses.map((e) => (
              <li key={e.id} className={cn("flex justify-between gap-3 px-5 py-2.5 text-sm", e.voidedAt && "opacity-50 line-through")}>
                <span>{e.label} <span className="text-ink-3">· {e.category} · {METHOD_LABEL[e.method]}</span></span>
                <Money value={e.amount} strong />
              </li>
            ))}
            {!s.expenses.length && <li className="px-5 py-4 text-sm text-ink-3">Aucune dépense.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
