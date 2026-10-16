"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ChevronDown, Zap, Search, ArrowLeft, ArrowRight, Check, MessageSquareText, Lock, X } from "lucide-react";
import { createOrder, type CreateOrderInput } from "@/server/actions/orders";
import type { DepositCatalog } from "@/server/queries/catalog";
import { CustomerPicker, type PickedCustomer } from "@/components/customers/customer-picker";
import { Button } from "@/components/ui/button";
import { AmountInput, Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { Money } from "@/components/money";
import { computeOrderTotals, type DiscountInput } from "@/lib/domain/totals";
import { computeDueAt, fromDateTimeLocal, toDateTimeLocal } from "@/lib/domain/dates";
import type { Method } from "@/lib/domain/cash";
import { useAction } from "@/lib/use-action";
import { MethodPicker } from "@/components/cash/method-picker";
import { cn } from "@/lib/cn";

type Line = {
  key: string; itemTypeId: string; serviceId: string; itemLabel: string; serviceLabel: string; unitPrice: number; quantity: number;
  color: string; brand: string; observations: string; open: boolean;
};

const STEPS = ["client", "articles", "options", "paiement"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = { client: "Client", articles: "Articles", options: "Options", paiement: "Paiement" };

type SubmitResult = { ok: true; data: { id: string; number: number } } | { ok: false; error: string };

export function DepositForm({ catalog, initialCustomer, hasOpenSession, isAdmin, settings, offline }: {
  catalog: DepositCatalog;
  initialCustomer: PickedCustomer | null;
  hasOpenSession: boolean;
  isAdmin: boolean;
  settings: { standardDelayHours: number; expressDelayHours: number; expressRatePct: number; agentMaxDiscountPct: number };
  /** Mode hors ligne : sélecteur de clients local, enregistrement local, pas de remise. */
  offline?: {
    customerPicker: (value: PickedCustomer | null, onChange: (c: PickedCustomer | null) => void) => React.ReactNode;
    submit: (input: CreateOrderInput) => Promise<SubmitResult>;
    onDone: (data: { id: string; number: number }) => void;
    onOpenCash: () => void;
    blockedReason?: string | null;
  };
}) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [depositKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState<Step>(initialCustomer ? "articles" : "client");

  const [customer, setCustomer] = useState<PickedCustomer | null>(initialCustomer);
  const [lines, setLines] = useState<Line[]>([]);
  const [pickedItem, setPickedItem] = useState<string | null>(null);
  const [itemQuery, setItemQuery] = useState("");
  const [isExpress, setIsExpress] = useState(false);
  const [dueEdited, setDueEdited] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"MONTANT" | "POURCENT">("MONTANT");
  const [discountValue, setDiscountValue] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [deposit, setDeposit] = useState<number | null>(null);
  const [method, setMethod] = useState<Method>("ESPECES");
  const [reference, setReference] = useState("");
  const [openedAt] = useState(() => new Date());

  const priceOf = (itemId: string, serviceId: string) => catalog.prices.find((p) => p.itemTypeId === itemId && p.serviceId === serviceId)?.amount;
  const frequent = catalog.items.filter((i) => i.isFrequent);
  const others = catalog.items.filter((i) => !i.isFrequent);
  const filtered = itemQuery.trim()
    ? catalog.items.filter((i) => i.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(itemQuery.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")))
    : null;

  const discount: DiscountInput = useMemo(() => (discountValue ? { type: discountType, value: discountValue } : null), [discountType, discountValue]);
  const totals = useMemo(() => computeOrderTotals(lines, { isExpress, expressRatePct: settings.expressRatePct, discount }),
    [lines, isExpress, settings.expressRatePct, discount]);
  const autoDue = computeDueAt(openedAt, { isExpress, standardHours: settings.standardDelayHours, expressHours: settings.expressDelayHours });
  const dueValue = dueEdited ?? toDateTimeLocal(autoDue);
  const discountTooHigh = !isAdmin && totals.discountPct > settings.agentMaxDiscountPct + 1e-9;
  const depositTooHigh = (deposit ?? 0) > totals.total;
  const depositBlocked = (deposit ?? 0) > 0 && !hasOpenSession;
  const pieces = lines.reduce((s, l) => s + l.quantity, 0);

  function addLine(itemTypeId: string, serviceId: string) {
    const unitPrice = priceOf(itemTypeId, serviceId);
    if (unitPrice === undefined) return;
    const item = catalog.items.find((i) => i.id === itemTypeId)!;
    const svc = catalog.services.find((s) => s.id === serviceId)!;
    setLines((ls) => {
      const same = ls.find((l) => l.itemTypeId === itemTypeId && l.serviceId === serviceId && !l.color && !l.brand && !l.observations);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: crypto.randomUUID(), itemTypeId, serviceId, itemLabel: item.name, serviceLabel: svc.shortName, unitPrice, quantity: 1, color: "", brand: "", observations: "", open: false }];
    });
    setPickedItem(null);
    setItemQuery("");
  }
  const updateLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const canNext: Record<Step, boolean> = { client: !!customer, articles: lines.length > 0, options: !discountTooHigh, paiement: true };
  const blockedReason = offline?.blockedReason ?? null;
  const canSubmit = !!customer && lines.length > 0 && !discountTooHigh && !depositTooHigh && !depositBlocked && !blockedReason;

  async function submit() {
    if (!customer) { setStep("client"); return; }
    const dueDate = fromDateTimeLocal(dueValue);
    const send = (input: CreateOrderInput) => (offline ? offline.submit(input) : createOrder(input));
    await exec(() => send({
      idempotencyKey,
      customerId: customer.id,
      lines: lines.map((l) => ({ itemTypeId: l.itemTypeId, serviceId: l.serviceId, quantity: l.quantity, color: l.color, brand: l.brand, observations: l.observations })),
      isExpress,
      dueAt: dueEdited && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
      discount,
      notes,
      deposit: deposit ? { idempotencyKey: depositKey, amount: deposit, method, reference: method === "ESPECES" ? "" : reference } : null,
    }), { onSuccess: (d) => (offline ? offline.onDone(d) : router.push(`/depot/confirmation/${d.id}`)) });
  }

  const vis = (s: Step) => cn(step !== s && "hidden", "lg:block");
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="pb-20 lg:pb-0">
      <div className="mb-4 flex items-center justify-between gap-3 lg:mb-6 lg:items-end">
        <div>
          <h1 className="text-xl font-semibold tracking-[-0.01em] lg:text-2xl">Nouveau dépôt</h1>
          <p className="mt-1 hidden text-[15px] text-ink-3 lg:block">Client, articles, options, acompte.</p>
        </div>
        {!offline && <Link href="/" className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-subtle lg:hidden" aria-label="Quitter le dépôt"><X className="size-5" /></Link>}
      </div>

      {/* Progression (téléphone) */}
      <ol className="mb-4 grid grid-cols-4 gap-1.5 lg:hidden">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => (i <= stepIndex || STEPS.slice(0, i).every((x) => canNext[x])) && setStep(s)} className="w-full text-left">
              <span className={cn("block h-1 rounded-full", i <= stepIndex ? "bg-brand" : "bg-line")} />
              <span className={cn("mt-1.5 block text-[12px] font-medium", i === stepIndex ? "text-brand" : "text-ink-3")}>{STEP_LABEL[s]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        {/* Colonne gauche : client puis articles */}
        <div className="space-y-6">
          <section className={cn(vis("client"), "rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5")}>
            <StepTitle n={1} title="Client" done={!!customer} />
            {(() => {
              const pick = (c: PickedCustomer | null) => { setCustomer(c); if (c && window.innerWidth < 1024) setStep("articles"); };
              return offline ? offline.customerPicker(customer, pick) : <CustomerPicker value={customer} onChange={pick} />;
            })()}
          </section>

          <section className={cn(vis("articles"), "rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5")}>
            <StepTitle n={2} title="Articles" done={lines.length > 0} />
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} placeholder="Chercher un article…" className="pl-9" aria-label="Chercher un article" />
            </div>
            {catalog.items.length === 0 && (
              <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-[#8a5300]">Aucun article avec prix. Le gérant doit compléter le catalogue (Paramètres › Catalogue).</p>
            )}
            {(filtered ?? frequent).length > 0 && (
              <>
                {!filtered && <p className="eyebrow mb-2">Articles fréquents</p>}
                <ItemGrid items={filtered ?? frequent} picked={pickedItem} onPick={setPickedItem} lines={lines} />
              </>
            )}
            {!filtered && others.length > 0 && (
              <details className="group mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
                  <ChevronDown className="size-4 transition group-open:rotate-180" /> Autres articles ({others.length})
                </summary>
                <div className="mt-3"><ItemGrid items={others} picked={pickedItem} onPick={setPickedItem} lines={lines} /></div>
              </details>
            )}
            {pickedItem && (
              <>
              {/* Téléphone : choix du service dans un panneau en bas de l'écran, à portée de pouce */}
              <button type="button" aria-label="Fermer" onClick={() => setPickedItem(null)} className="fixed inset-0 z-40 bg-ink/30 lg:hidden" />
              <div role="dialog" aria-label="Choisir le service"
                className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-pop lg:static lg:z-auto lg:mt-4 lg:rounded-lg lg:border lg:border-brand-100 lg:bg-brand-50/50 lg:p-4 lg:shadow-none">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink-2">Service pour <span className="font-semibold text-ink">{catalog.items.find((i) => i.id === pickedItem)?.name}</span></p>
                  <button type="button" onClick={() => setPickedItem(null)} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-subtle lg:hidden" aria-label="Annuler"><X className="size-5" /></button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {catalog.services.map((s) => {
                    const p = priceOf(pickedItem, s.id);
                    if (p === undefined) return null;
                    return (
                      <button key={s.id} type="button" onClick={() => addLine(pickedItem, s.id)}
                        className="flex min-h-[3.25rem] items-center justify-between gap-2 rounded-md border border-line-2 bg-surface px-3.5 py-2 text-left transition hover:border-brand hover:ring-3 hover:ring-brand/10">
                        <span className="text-[14.5px] font-medium leading-tight">{s.name}</span>
                        <Money value={p} unit={false} className="text-sm font-semibold text-brand" />
                      </button>
                    );
                  })}
                </div>
              </div>
              </>
            )}
          </section>
        </div>

        {/* Colonne droite : panier collant */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <section className={cn(vis("articles"), "rounded-lg border border-line bg-surface shadow-card")}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-semibold">Panier</h2>
              <span className="text-sm text-ink-3 tnum">{pieces} pièce{pieces > 1 ? "s" : ""}</span>
            </div>
            {lines.length === 0 ? (
              <p className="border-t border-line px-5 py-8 text-center text-sm text-ink-3">Touchez un article puis un service pour l&apos;ajouter.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {lines.map((l) => {
                  const hasObs = !!(l.color || l.brand || l.observations);
                  return (
                    <li key={l.key} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{l.itemLabel}</p>
                          <p className="text-[13px] text-ink-3">{l.serviceLabel} · <Money value={l.unitPrice} unit={false} /> l&apos;unité</p>
                        </div>
                        <Money value={l.unitPrice * l.quantity} unit={false} className="pt-0.5 text-right text-[15px] font-semibold" />
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <div className="flex items-center rounded-md border border-line-2">
                          <button type="button" className="grid size-10 place-items-center text-ink-2 hover:bg-subtle disabled:opacity-40" aria-label="Moins"
                            disabled={l.quantity <= 1} onClick={() => updateLine(l.key, { quantity: l.quantity - 1 })}><Minus className="size-4" /></button>
                          <span className="w-9 text-center text-[15px] font-semibold tnum">{l.quantity}</span>
                          <button type="button" className="grid size-10 place-items-center text-ink-2 hover:bg-subtle" aria-label="Plus"
                            onClick={() => updateLine(l.key, { quantity: Math.min(999, l.quantity + 1) })}><Plus className="size-4" /></button>
                        </div>
                        <button type="button" onClick={() => updateLine(l.key, { open: !l.open })} aria-label="Observations" aria-expanded={l.open}
                          className={cn("relative ml-auto flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium hover:bg-subtle", l.open ? "text-brand" : "text-ink-3")}>
                          <MessageSquareText className="size-[18px]" /><span className="hidden min-[360px]:inline">Détails</span>
                          {hasObs && <span className="absolute right-1 top-1.5 size-2 rounded-full bg-warning ring-2 ring-surface" />}
                        </button>
                        <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Retirer la ligne"
                          className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger">
                          <Trash2 className="size-[18px]" />
                        </button>
                      </div>
                      {l.open && (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input value={l.color} onChange={(e) => updateLine(l.key, { color: e.target.value })} placeholder="Couleur" aria-label="Couleur" />
                          <Input value={l.brand} onChange={(e) => updateLine(l.key, { brand: e.target.value })} placeholder="Marque" aria-label="Marque" />
                          <Input className="sm:col-span-2" value={l.observations} onChange={(e) => updateLine(l.key, { observations: e.target.value })}
                            placeholder="Observations : tache, déchirure, bouton manquant…" aria-label="Observations" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={cn(vis("options"), "rounded-lg border border-line bg-surface p-4 shadow-card sm:p-5")}>
            <StepTitle n={3} title="Options" />
            <div className="space-y-4">
              <button type="button" onClick={() => { setIsExpress(!isExpress); setDueEdited(null); }}
                className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition",
                  isExpress ? "border-warning bg-warning-50" : "border-line-2 hover:bg-canvas")} aria-pressed={isExpress}>
                <Zap className={cn("size-5", isExpress ? "text-warning" : "text-ink-3")} />
                <span className="flex-1">
                  <span className="block font-medium">Express</span>
                  <span className="text-[13px] text-ink-3">+{settings.expressRatePct} % · prêt en {settings.expressDelayHours} h</span>
                </span>
                <span className={cn("relative h-6 w-10 rounded-full transition", isExpress ? "bg-warning" : "bg-line-2")}>
                  <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", isExpress ? "left-[18px]" : "left-0.5")} />
                </span>
              </button>
              <Field label="Retrait prévu" htmlFor="due" hint={dueEdited ? <button type="button" className="text-brand" onClick={() => setDueEdited(null)}>Revenir au calcul automatique</button> : "Calculé automatiquement, modifiable."}>
                <Input id="due" type="datetime-local" value={dueValue} onChange={(e) => setDueEdited(e.target.value)} className="tnum" />
              </Field>
              {!offline && <Field label="Remise" error={discountTooHigh ? `Au-delà de ${settings.agentMaxDiscountPct} %, la remise est réservée au gérant.` : undefined}>
                <div className="flex gap-2">
                  <div className="flex rounded-md border border-line-2 p-0.5">
                    {(["MONTANT", "POURCENT"] as const).map((t) => (
                      <button key={t} type="button" onClick={() => setDiscountType(t)}
                        className={cn("h-9 rounded-[5px] px-3 text-sm font-medium", discountType === t ? "bg-brand text-white" : "text-ink-2 hover:bg-subtle")}>
                        {t === "MONTANT" ? "FCFA" : "%"}
                      </button>
                    ))}
                  </div>
                  <div className="flex-1">
                    {discountType === "MONTANT"
                      ? <AmountInput value={discountValue} onChange={setDiscountValue} placeholder="0" aria-label="Remise en FCFA" aria-invalid={discountTooHigh} />
                      : <Input inputMode="numeric" value={discountValue ?? ""} placeholder="0" aria-label="Remise en %" aria-invalid={discountTooHigh} className="tnum text-right"
                          onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); setDiscountValue(d ? Math.min(100, parseInt(d, 10)) : null); }} />}
                  </div>
                </div>
              </Field>}
              <Field label="Notes" htmlFor="notes"><Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions particulières" /></Field>
            </div>
          </section>

          <section className={cn(vis("paiement"), "rounded-lg border border-line bg-surface shadow-card")}>
            <div className="p-5">
              <StepTitle n={4} title="Récapitulatif et acompte" />
              {customer && <p className="-mt-1 mb-4 text-sm text-ink-3">Client : <span className="font-medium text-ink">{customer.fullName}</span></p>}
              <dl className="space-y-2 text-[14.5px]">
                <Row label={`Sous-total (${pieces} pièce${pieces > 1 ? "s" : ""})`}><Money value={totals.subtotal} /></Row>
                {totals.expressAmount > 0 && <Row label={`Express +${settings.expressRatePct} %`}><Money value={totals.expressAmount} /></Row>}
                {totals.discountAmount > 0 && <Row label="Remise"><span className="text-success">−<Money value={totals.discountAmount} /></span></Row>}
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="font-semibold">Total</span>
                <Money value={totals.total} className="text-[28px] font-semibold tracking-[-0.02em]" />
              </div>
            </div>
            <div className="space-y-3 border-t border-line bg-canvas/50 p-5">
              <Field label="Acompte (facultatif)" error={depositTooHigh ? "L'acompte dépasse le total." : undefined}>
                <div className="flex gap-2">
                  <div className="flex-1"><AmountInput value={deposit} onChange={setDeposit} placeholder="0" aria-label="Acompte" aria-invalid={depositTooHigh} /></div>
                  <Button type="button" variant="secondary" onClick={() => setDeposit(totals.total || null)} disabled={!totals.total}>Tout</Button>
                </div>
              </Field>
              {(deposit ?? 0) > 0 && (
                <>
                  <MethodPicker value={method} onChange={setMethod} />
                  {method !== "ESPECES" && <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence de transaction (facultatif)" aria-label="Référence" />}
                  {depositBlocked && (
                    <p className="flex flex-wrap items-center gap-2 rounded-md bg-warning-50 px-3 py-2 text-sm text-[#8a5300]">
                      <Lock className="size-4" /> Caisse fermée : impossible d&apos;encaisser.
                      {offline
                        ? <button type="button" onClick={offline.onOpenCash} className="font-semibold underline">Ouvrir ma caisse</button>
                        : <Link href="/caisse" className="font-semibold underline">Ouvrir ma caisse</Link>}
                    </p>
                  )}
                  <p className="flex justify-between text-sm text-ink-2"><span>Reste à payer au retrait</span><Money value={Math.max(0, totals.total - (deposit ?? 0))} strong /></p>
                </>
              )}
              <SaveButton type="button" size="xl" block loading={pending} disabled={!canSubmit} onClick={submit} className="mt-2 hidden lg:inline-flex">
                <Check /> Valider le dépôt
              </SaveButton>
              {blockedReason && (
                <p className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2.5 text-sm font-medium text-danger"><Lock className="mt-0.5 size-4 shrink-0" />{blockedReason}</p>
              )}
              {!canSubmit && !blockedReason && (
                <p className="hidden text-center text-[13px] text-ink-3 lg:block">
                  {!customer ? "Choisissez un client." : lines.length === 0 ? "Ajoutez au moins un article." : "Corrigez les champs signalés."}
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Barre collante (téléphone) */}
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-3">
          {stepIndex > 0 && (
            <Button type="button" variant="secondary" size="icon" onClick={() => setStep(STEPS[stepIndex - 1])} aria-label="Étape précédente"><ArrowLeft /></Button>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-ink-3">Total{pieces > 0 && ` · ${pieces} pièce${pieces > 1 ? "s" : ""}`}</p>
            <Money value={totals.total} className="text-lg font-semibold" />
          </div>
          {step === "paiement" ? (
            <SaveButton type="button" size="lg" loading={pending} disabled={!canSubmit} onClick={submit}><Check />Valider</SaveButton>
          ) : (
            <Button type="button" size="lg" disabled={!canNext[step]} onClick={() => setStep(STEPS[stepIndex + 1])}>Suivant<ArrowRight /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepTitle({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className={cn("grid size-6 place-items-center rounded-full text-[12px] font-semibold", done ? "bg-success text-white" : "bg-brand-50 text-brand")}>
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <h2 className="text-[15px] font-semibold">{title}</h2>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><dt className="text-ink-2">{label}</dt><dd className="tnum">{children}</dd></div>;
}

function ItemGrid({ items, picked, onPick, lines }: { items: { id: string; name: string }[]; picked: string | null; onPick: (id: string) => void; lines: Line[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 xl:grid-cols-4">
      {items.map((i) => {
        const count = lines.filter((l) => l.itemTypeId === i.id).reduce((s, l) => s + l.quantity, 0);
        return (
          <button key={i.id} type="button" onClick={() => onPick(i.id)}
            className={cn("relative flex min-h-14 items-center justify-center rounded-lg border px-2 py-2.5 text-center text-[14px] sm:min-h-16 sm:px-3 sm:text-[14.5px] font-medium leading-tight transition",
              picked === i.id ? "border-brand bg-brand-50 text-brand ring-3 ring-brand/12" : "border-line-2 bg-surface hover:border-ink-3/40 hover:bg-canvas")}>
            {i.name}
            {count > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white tnum">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
