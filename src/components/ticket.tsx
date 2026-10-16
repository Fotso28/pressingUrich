import type { OrderDetail } from "@/server/queries/orders";
import type { Settings } from "@/server/queries/settings";
import { formatAmount } from "@/lib/domain/money";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatPhone } from "@/lib/domain/normalize";
import { METHOD_LABEL } from "@/lib/domain/cash";

export function TicketHeader({ s }: { s: Settings }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" style={{ display: "block", width: "52mm", margin: "0 auto 2mm", filter: "grayscale(1) contrast(1.6)" }} />
      <h1>{s.shopName.toUpperCase()}</h1>
      {s.address && <div className="c">{s.address}</div>}
      {s.phones && <div className="c">{s.phones}</div>}
      {s.website && <div className="c">{s.website}</div>}
      <hr />
    </>
  );
}

/** Ticket client 80 mm (UI/UX §5). `kind="recu"` imprime le reçu de retrait. */
export function Ticket({ o, s, kind = "ticket", agentName }: { o: OrderDetail; s: Settings; kind?: "ticket" | "recu"; agentName: string }) {
  const lastPayment = [...o.payments].reverse().find((p) => !p.p.voidedAt);
  const remaining = o.order.total - o.order.amountPaid;
  return (
    <div className="ticket">
      <TicketHeader s={s} />
      <div className="big">{kind === "recu" ? "REÇU DE RETRAIT" : "TICKET"} N° {formatOrderNumber(o.order.number)}</div>
      {o.order.status === "ANNULEE" && <div className="big c">*** COMMANDE ANNULÉE ***</div>}
      <div>Dépôt : {formatDateTime(o.order.createdAt)}</div>
      {kind === "recu" && o.order.collectedAt
        ? <div>Retrait : {formatDateTime(o.order.collectedAt)}</div>
        : <div>Retrait prévu : {formatDate(o.order.dueAt)}</div>}
      <div>Client : {o.customer.fullName}</div>
      <div>Tél : {formatPhone(o.customer.phone)}</div>
      <hr />
      {o.items.map((i) => (
        <div key={i.id}>
          <div className="r"><span>{i.quantity} x {i.itemLabel}  {i.serviceLabel}</span><span>{formatAmount(i.lineTotal)}</span></div>
          {(i.color || i.brand) && <div className="muted">    {[i.color, i.brand].filter(Boolean).join(" · ")}</div>}
          {i.observations && <div className="muted">    Obs : {i.observations}</div>}
        </div>
      ))}
      <hr />
      <div className="r"><span>Sous-total</span><span>{formatAmount(o.order.subtotal)}</span></div>
      {o.order.expressAmount > 0 && <div className="r"><span>Express +{o.order.expressRatePct} %</span><span>{formatAmount(o.order.expressAmount)}</span></div>}
      {o.order.discountAmount > 0 && <div className="r"><span>Remise</span><span>-{formatAmount(o.order.discountAmount)}</span></div>}
      <div className="r big"><span>TOTAL</span><span>{formatAmount(o.order.total)}</span></div>
      <div className="r"><span>Payé{lastPayment ? ` (${METHOD_LABEL[lastPayment.p.method]})` : ""}</span><span>{formatAmount(o.order.amountPaid)}</span></div>
      <div className="r big"><span>RESTE À PAYER</span><span>{formatAmount(remaining)}</span></div>
      <hr />
      <div>Agent : {agentName}</div>
      {o.order.notes && <div className="muted">Note : {o.order.notes}</div>}
      {s.ticketFooter && <div style={{ marginTop: 4 }}>{s.ticketFooter}</div>}
      {kind === "recu" && <div className="c" style={{ marginTop: 6 }}>Merci de votre confiance.</div>}
    </div>
  );
}
