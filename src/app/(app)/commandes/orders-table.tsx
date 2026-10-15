"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, ChevronRight, Zap } from "lucide-react";
import { advanceOrderStatus } from "@/server/actions/orders";
import type { OrderRow, OrdersTab } from "@/server/queries/orders";
import { FlagDot, StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { SaveButton } from "@/components/save-button";
import { Money } from "@/components/money";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatDate } from "@/lib/domain/dates";
import { formatPhone } from "@/lib/domain/normalize";
import { NEXT_STEP_LABEL, isAbandoned, isLate, nextWorkshopStatus } from "@/lib/domain/status";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

export function OrdersTable({ rows, abandonedAfterDays }: { rows: OrderRow[]; tab: OrdersTab; abandonedAfterDays: number; isAdmin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const { exec, pending } = useAction();
  const selectable = rows.filter((r) => nextWorkshopStatus(r.status));
  const allChecked = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  const now = new Date();

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function advance(ids: string[], label: string) {
    await exec(() => advanceOrderStatus(ids), {
      success: label,
      onSuccess: () => { setSelected(new Set()); router.refresh(); },
    });
    setBusyId(null);
  }

  if (!rows.length) {
    return <div className="rounded-lg border border-line bg-surface shadow-card"><EmptyState icon={<ClipboardList />} title="Aucune commande">Aucune commande ne correspond à ces critères.</EmptyState></div>;
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allToReady = selectedRows.length > 0 && selectedRows.every((r) => r.status === "EN_TRAITEMENT");

  const action = (r: OrderRow) => {
    const next = nextWorkshopStatus(r.status);
    if (next) {
      return (
        <SaveButton size="sm" variant={r.status === "EN_TRAITEMENT" ? "success" : "soft"} loading={busyId === r.id}
          onClick={(e) => { e.preventDefault(); setBusyId(r.id); advance([r.id], `N° ${formatOrderNumber(r.number)} : ${next === "PRETE" ? "prête" : "en traitement"}.`); }}>
          {NEXT_STEP_LABEL[r.status]}
        </SaveButton>
      );
    }
    if (r.status === "PRETE") return <Link href={`/commandes/${r.id}`} className="inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-medium text-white hover:bg-brand-600">Retrait</Link>;
    return null;
  };

  const flags = (r: OrderRow) => (
    <>
      {isLate({ status: r.status, dueAt: new Date(r.dueAt) }, now) && <FlagDot kind="late" />}
      {isAbandoned({ status: r.status, readyAt: r.readyAt ? new Date(r.readyAt) : null }, abandonedAfterDays, now) && <FlagDot kind="abandoned" />}
    </>
  );

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-[72px] z-10 mb-3 flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2.5 shadow-card">
          <span className="text-sm font-medium text-brand tnum">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <div className="ml-auto flex gap-2">
            <button className="h-9 rounded-md px-3 text-sm font-medium text-ink-2 hover:bg-white/60" onClick={() => setSelected(new Set())}>Annuler</button>
            <SaveButton size="sm" variant={allToReady ? "success" : "primary"} loading={pending && !busyId}
              onClick={() => advance([...selected], `${selected.size} commande(s) avancée(s).`)}>
              {allToReady ? "Marquer prêtes" : "Étape suivante"}
            </SaveButton>
          </div>
        </div>
      )}

      {/* Tableau (PC / tablette) */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface shadow-card md:block">
        <table className="w-full text-[14.5px]">
          <thead>
            <tr className="border-b border-line bg-canvas/70 text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3">
              <th className="w-12 px-4 py-3">
                {selectable.length > 0 && <input type="checkbox" aria-label="Tout sélectionner" checked={allChecked} className="size-4 accent-[#2F4797]"
                  onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))} />}
              </th>
              <th className="px-3 py-3">N°</th>
              <th className="px-3 py-3">Client</th>
              <th className="px-3 py-3 text-right">Art.</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">Reste</th>
              <th className="px-3 py-3">Prévue</th>
              <th className="px-3 py-3">Statut</th>
              <th className="px-4 py-3 text-right"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const remaining = r.total - r.amountPaid;
              const late = isLate({ status: r.status, dueAt: new Date(r.dueAt) }, now);
              return (
                <tr key={r.id} className={cn("group cursor-pointer transition-colors hover:bg-canvas", selected.has(r.id) && "bg-brand-50/40")}
                  onClick={() => router.push(`/commandes/${r.id}`)}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {nextWorkshopStatus(r.status) && <input type="checkbox" aria-label={`Sélectionner ${formatOrderNumber(r.number)}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="size-4 accent-[#2F4797]" />}
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/commandes/${r.id}`} className="font-semibold tnum" onClick={(e) => e.stopPropagation()}>{formatOrderNumber(r.number)}</Link>
                    {r.isExpress && <Zap className="ml-1 inline size-3.5 text-warning" aria-label="Express" />}
                  </td>
                  <td className="max-w-[240px] px-3 py-3">
                    <p className="truncate font-medium">{r.customerName}</p>
                    <p className="text-[13px] text-ink-3 tnum">{formatPhone(r.customerPhone)}</p>
                  </td>
                  <td className="px-3 py-3 text-right tnum text-ink-2">{r.itemsCount}</td>
                  <td className="px-3 py-3 text-right"><Money value={r.total} unit={false} /></td>
                  <td className="px-3 py-3 text-right">{remaining > 0 && r.status !== "ANNULEE" ? <Money value={remaining} unit={false} strong className="text-warning" /> : <span className="text-ink-3">—</span>}</td>
                  <td className={cn("px-3 py-3 tnum", late ? "font-medium text-danger" : "text-ink-2")}>{formatDate(r.dueAt)}</td>
                  <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><StatusBadge status={r.status} />{flags(r)}</div></td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>{action(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cartes (téléphone) */}
      <ul className="space-y-2.5 md:hidden">
        {rows.map((r) => {
          const remaining = r.total - r.amountPaid;
          return (
            <li key={r.id} className={cn("rounded-lg border border-line bg-surface p-4 shadow-card", selected.has(r.id) && "border-brand-100 bg-brand-50/40")}>
              <div className="flex items-start gap-3">
                {nextWorkshopStatus(r.status) && <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 size-5 accent-[#2F4797]" aria-label="Sélectionner" />}
                <Link href={`/commandes/${r.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tnum">{formatOrderNumber(r.number)}</span>
                    {r.isExpress && <Zap className="size-3.5 text-warning" />}
                    <StatusBadge status={r.status} className="ml-auto" />
                  </div>
                  <p className="mt-1 truncate font-medium">{r.customerName}</p>
                  <p className="text-[13px] text-ink-3 tnum">{r.itemsCount} art. · prévue {formatDate(r.dueAt)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">{flags(r)}</div>
                </Link>
                <ChevronRight className="mt-1 size-4 text-ink-3" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm text-ink-3">{remaining > 0 && r.status !== "ANNULEE" ? <>Reste <Money value={remaining} strong className="text-warning" /></> : <>Total <Money value={r.total} /></>}</span>
                {action(r)}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
