"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as D from "@radix-ui/react-dialog";
import { Search, User, Hash, CornerDownLeft } from "lucide-react";
import { globalSearch } from "@/server/actions/customers";
import { StatusBadge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatPhone } from "@/lib/domain/normalize";
import type { CustomerHit, OrderHit } from "@/server/queries/search";
import { cn } from "@/lib/cn";

type Hit = { kind: "order"; o: OrderHit } | { kind: "customer"; c: CustomerHit };

/** Recherche globale (raccourci « / ») : n° de commande, téléphone ou nom. */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await globalSearch(term);
        if (my !== seq.current) return;
        if (r.ok) {
          setHits([...r.data.orders.map((o) => ({ kind: "order" as const, o })), ...r.data.customers.map((c) => ({ kind: "customer" as const, c }))]);
          setActive(0);
        }
      } finally { if (my === seq.current) setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  function go(h: Hit) {
    setOpen(false);
    setQ("");
    router.push(h.kind === "order" ? `/commandes/${h.o.id}` : `/clients/${h.c.id}`);
  }

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="flex h-10 w-full min-w-0 max-w-md items-center gap-2.5 rounded-md border border-line bg-canvas px-3 text-left text-[14.5px] text-ink-3 transition hover:border-line-2">
        <Search className="size-4" />
        <span className="min-w-0 flex-1 truncate"><span className="sm:hidden">Rechercher…</span><span className="hidden sm:inline">Rechercher n° de ticket, téléphone ou nom…</span></span>
        <kbd className="hidden rounded border border-line-2 bg-surface px-1.5 text-[12px] font-medium text-ink-3 sm:inline">/</kbd>
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[8vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl bg-surface shadow-pop outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && hits[active]) { e.preventDefault(); go(hits[active]); }
          }}>
          <D.Title className="sr-only">Recherche globale</D.Title>
          <D.Description className="sr-only">Rechercher une commande ou un client</D.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-5 text-ink-3" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value.trim()) setHits([]); }} placeholder="N° de ticket, téléphone ou nom"
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3" />
            {loading && <span className="size-4 rounded-full border-2 border-brand border-r-transparent animate-spin" />}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {q.trim() && !loading && hits.length === 0 && <p className="px-3 py-8 text-center text-sm text-ink-3">Aucun résultat pour « {q.trim()} ».</p>}
            {!q.trim() && <p className="px-3 py-8 text-center text-sm text-ink-3">Tapez un numéro de ticket (ex. 482), un téléphone ou un nom.</p>}
            {hits.map((h, i) => (
              <button key={h.kind + (h.kind === "order" ? h.o.id : h.c.id)} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left", i === active && "bg-subtle")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-md bg-canvas text-ink-3 ring-1 ring-line">
                  {h.kind === "order" ? <Hash className="size-4" /> : <User className="size-4" />}
                </span>
                {h.kind === "order" ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium tnum">N° {formatOrderNumber(h.o.number)} <span className="font-normal text-ink-3">· {h.o.customerName}</span></p>
                      <p className="text-[13px] text-ink-3">Reste <Money value={h.o.total - h.o.amountPaid} /></p>
                    </div>
                    <StatusBadge status={h.o.status} />
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.c.fullName}</p>
                    <p className="text-[13px] text-ink-3 tnum">{formatPhone(h.c.phone)} · {h.c.openOrders} en cours</p>
                  </div>
                )}
                {i === active && <CornerDownLeft className="size-4 text-ink-3" />}
              </button>
            ))}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
