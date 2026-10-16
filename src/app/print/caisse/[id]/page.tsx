import { notFound } from "next/navigation";
import { pageUser } from "@/server/session";
import { getCashSessionSummary } from "@/server/queries/cash";
import { getSettings } from "@/server/queries/settings";
import { TicketHeader } from "@/components/ticket";
import { METHOD_LABEL } from "@/lib/domain/cash";
import { formatAmount } from "@/lib/domain/money";
import { formatDateTime } from "@/lib/domain/dates";

export default async function CashPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [u, s, settings] = await Promise.all([pageUser(), getCashSessionSummary(id), getSettings()]);
  // Un agent n'imprime que ses propres clôtures.
  if (!s || (u.role !== "ADMIN" && s.session.userId !== u.id)) notFound();
  const voidless = (xs: { voidedAt: Date | null }[]) => xs.filter((x) => !x.voidedAt).length;
  return (
    <div className="ticket">
      <TicketHeader s={settings} />
      <div className="big">CLÔTURE DE CAISSE</div>
      <div>Agent : {s.userName}</div>
      <div>Ouverte : {formatDateTime(s.session.openedAt)}</div>
      {s.session.closedAt && <div>Fermée : {formatDateTime(s.session.closedAt)}</div>}
      <div>Fond : {formatAmount(s.session.openingFloat)}</div>
      <div>{voidless(s.payments.map((x) => x.p))} encaissement(s), {voidless(s.expenses)} dépense(s)</div>
      <hr />
      {s.rows.map((r) => {
        const c = s.counts.find((k) => k.method === r.method);
        return (
          <div key={r.method} style={{ marginBottom: 4 }}>
            <div className="big">{METHOD_LABEL[r.method]}</div>
            <div className="r"><span>Encaissé</span><span>{formatAmount(r.received)}</span></div>
            <div className="r"><span>Dépenses</span><span>-{formatAmount(r.spent)}</span></div>
            <div className="r"><span>Attendu</span><span>{formatAmount(c?.expected ?? r.expected)}</span></div>
            {c && <div className="r"><span>Compté</span><span>{formatAmount(c.counted)}</span></div>}
            {c && <div className="r"><span>Écart</span><span>{formatAmount(c.difference)}</span></div>}
          </div>
        );
      })}
      {s.session.closingComment && <><hr /><div>Commentaire : {s.session.closingComment}</div></>}
      <hr />
      <div className="c">Signature agent / gérant</div>
      <div style={{ height: 40 }} />
    </div>
  );
}
