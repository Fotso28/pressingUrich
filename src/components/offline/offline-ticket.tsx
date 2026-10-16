"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ticket } from "@/components/ticket";
import { fitPageToContent, paperOf, ticketCss } from "@/components/print/ticket-css";
import type { OrderDetail } from "@/server/queries/orders";
import type { Settings } from "@/server/queries/settings";
import type { OfflineOrder, Snapshot } from "@/lib/offline/types";

/** Adapte une commande locale au format du ticket imprimé en ligne (même rendu, même papier B7). */
function toDetail(o: OfflineOrder): OrderDetail {
  return {
    order: {
      ...o, number: o.number, createdAt: new Date(o.createdAt), dueAt: new Date(o.dueAt), collectedAt: o.collectedAt ? new Date(o.collectedAt) : null,
    },
    customer: { fullName: o.customerName, phone: o.customerPhone },
    items: o.items.map((i, k) => ({ ...i, id: String(k) })),
    payments: o.lastMethod ? [{ p: { method: o.lastMethod, voidedAt: null } }] : [],
  } as unknown as OrderDetail;
}

/** Impression sans réseau : le ticket est rendu dans la page et imprimé avec window.print(). */
export function useOfflinePrint(settings: Snapshot["settings"]) {
  const [job, setJob] = useState<{ o: OfflineOrder; kind: "ticket" | "recu"; agent: string } | null>(null);
  useEffect(() => {
    if (!job) return;
    const t = setTimeout(() => {
      const el = document.querySelector<HTMLElement>(".cp-print");
      if (el) fitPageToContent(paperOf(settings.paperFormat), el);
      window.print();
      setJob(null);
    }, 150);
    return () => clearTimeout(t);
  }, [job, settings.paperFormat]);
  const node = job && typeof document !== "undefined"
    ? createPortal(
        <div className="cp-print">
          <Ticket o={toDetail(job.o)} s={settings as unknown as Settings} kind={job.kind} agentName={job.agent} />
        </div>, document.body)
    : null;
  return { print: (o: OfflineOrder, kind: "ticket" | "recu", agent: string) => setJob({ o, kind, agent }), node };
}

/** À l'écran, le ticket reste mesurable mais hors de vue ; à l'impression, il est seul sur la page. */
export const offlinePrintCss = (format: string | null | undefined) => `
@media screen { .cp-print { position: fixed; left: -10000px; top: 0; } }
@media print {
  body > *:not(.cp-print) { display: none !important; }
  ${ticketCss(paperOf(format))}
}`;
