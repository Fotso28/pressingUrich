"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, ChevronDown, Zap, Search, ArrowLeft, ArrowRight, Check, MessageSquareText, Lock, X, Scale, Shirt, RotateCcw } from "lucide-react";
import { createOrder, type CreateOrderInput } from "@/server/actions/orders";
import { getForfaitBalance } from "@/server/actions/forfaits";
import type { OrderLineInput } from "@/server/orders/lines";
import { allocateKilo, formatKg, kiloLinePrice, parseKg } from "@/lib/domain/kilo";
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

type PieceLine = {
  key: string; kind: "PIECE"; itemTypeId: string; serviceId: string; itemLabel: string; serviceLabel: string; unitPrice: number; quantity: number;
  /** Prix variable : bornes du prix choisi au dépôt. */
  minPrice: number; maxPrice: number | null;
  description: string; color: string; brand: string; observations: string; open: boolean;
};
type KiloLine = { key: string; kind: "KILO"; kiloTypeId: string; typeName: string; pricePerKg: number; grams: number; description: string; observations: string };
type ForfaitLine = { key: string; kind: "FORFAIT"; forfaitId: string; name: string; price: number; grams: number };
type Line = PieceLine | KiloLine | ForfaitLine;
export type DepositForfait = { id: string; name: string; price: number; grams: number };

/** Brouillon du dépôt en cours, gardé dans le navigateur : on reprend là où on s'était arrêté. */
type Draft = {
  v: 2; savedAt: number; step: Step; customer: PickedCustomer | null; lines: Line[]; isExpress: boolean; dueEdited: string | null;
  discountType: "MONTANT" | "POURCENT"; discountValue: number | null; notes: string; deposit: number | null; method: Method; reference: string;
  idempotencyKey: string; depositKey: string;
};
const DRAFT_TTL = 3 * 86_400_000;
const readDraft = (k: string): Draft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(k) ?? "null") as Draft | null;
    return d && d.v === 2 && Date.now() - d.savedAt < DRAFT_TTL ? d : null;
  } catch { return null; }
};

/** Prix possibles d'un article à prix variable : pas de 500 entre le minimum et le maximum (6 au plus). */
function priceSteps(min: number, max: number): number[] {
  const out = [min];
  for (let v = Math.ceil((min + 1) / 500) * 500; v < max; v += 500) out.push(v);
  out.push(max);
  return out.length <= 6 ? out : [min, max];
}

const STEPS = ["client", "articles", "options", "paiement"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = { client: "Client", articles: "Articles", options: "Options", paiement: "Paiement" };

type SubmitResult = { ok: true; data: { id: string; number: number } } | { ok: false; error: string };

export function DepositForm({ catalog, initialCustomer, hasOpenSession, isAdmin, settings, offline, draftKey, forfaits = [] }: {
  catalog: DepositCatalog;
  /** Clé du brouillon local (par compte). */
  draftKey: string;
  forfaits?: DepositForfait[];
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
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [depositKey, setDepositKey] = useState(() => crypto.randomUUID());
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
  const [mode, setMode] = useState<"PIECE" | "KILO">("PIECE");
  const [kgText, setKgText] = useState("");
  const [kgDesc, setKgDesc] = useState("");
  const kiloTypes = catalog.kiloTypes ?? [];
  const [kiloTypeId, setKiloTypeId] = useState<string | null>(kiloTypes[0]?.id ?? null);
  const [fetchedBalance, setFetchedBalance] = useState<{ customerId: string; grams: number } | null>(null);
  const balance = fetchedBalance && fetchedBalance.customerId === customer?.id ? fetchedBalance.grams : null;
  const [restored, setRestored] = useState<number | null>(null);
  const loaded = useRef(false);

  // Reprise du brouillon (une fois, côté navigateur). Un client passé dans l'URL ouvre un nouveau dépôt pour lui.
  useEffect(() => {
    const d = readDraft(draftKey);
    if (d && (!initialCustomer || d.customer?.id === initialCustomer.id) && (d.lines.length > 0 || d.customer)) {
      // Le brouillon n'existe que dans le navigateur : il ne peut être lu qu'après le premier rendu.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(d.step); setCustomer(d.customer); setLines(d.lines); setIsExpress(d.isExpress); setDueEdited(d.dueEdited);
      setDiscountType(d.discountType); setDiscountValue(d.discountValue); setNotes(d.notes); setDeposit(d.deposit);
      setMethod(d.method); setReference(d.reference); setIdempotencyKey(d.idempotencyKey); setDepositKey(d.depositKey);
      setRestored(d.savedAt);
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  // Sauvegarde à chaque modification.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (!customer && lines.length === 0) { localStorage.removeItem(draftKey); return; }
      const d: Draft = { v: 2, savedAt: Date.now(), step, customer, lines, isExpress, dueEdited, discountType, discountValue, notes, deposit, method, reference, idempotencyKey, depositKey };
      localStorage.setItem(draftKey, JSON.stringify(d));
    } catch { /* stockage indisponible : pas de brouillon */ }
  }, [draftKey, step, customer, lines, isExpress, dueEdited, discountType, discountValue, notes, deposit, method, reference, idempotencyKey, depositKey]);
  function resetDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* rien */ }
    setStep(initialCustomer ? "articles" : "client"); setCustomer(initialCustomer); setLines([]); setIsExpress(false); setDueEdited(null);
    setDiscountType("MONTANT"); setDiscountValue(null); setNotes(""); setDeposit(null); setMethod("ESPECES"); setReference("");
    setIdempotencyKey(crypto.randomUUID()); setDepositKey(crypto.randomUUID()); setRestored(null);
  }

  // Solde forfait du client (linge au kilo), en ligne seulement.
  useEffect(() => {
    if (!customer || offline) return;
    let alive = true;
    const id = customer.id;
    getForfaitBalance({ customerId: id }).then((r) => { if (alive && r.ok) setFetchedBalance({ customerId: id, grams: r.data }); });
    return () => { alive = false; };
  }, [customer, offline]);

  const priceRow = (itemId: string, serviceId: string) => catalog.prices.find((p) => p.itemTypeId === itemId && p.serviceId === serviceId);
  const priceOf = (itemId: string, serviceId: string) => priceRow(itemId, serviceId)?.amount;
  const servicesOf = (itemId: string) => catalog.services.filter((s) => priceOf(itemId, s.id) !== undefined);
  const frequent = catalog.items.filter((i) => i.isFrequent);
  const others = catalog.items.filter((i) => !i.isFrequent);
  const filtered = itemQuery.trim()
    ? catalog.items.filter((i) => i.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(itemQuery.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")))
    : null;

  const discount: DiscountInput = useMemo(() => (discountValue ? { type: discountType, value: discountValue } : null), [discountType, discountValue]);
  // Linge au kilo : couvert par le solde forfait du client et les forfaits achetés dans ce dépôt.
  // Hors ligne, le solde forfait n'est pas connu : le linge au kilo est facturé au prix du kilo.
  const alloc = useMemo(() => allocateKilo(offline ? 0 : (balance ?? 0), lines.map((l) => (l.kind === "KILO"
    ? { kind: l.kind, grams: l.grams, pricePerKg: l.pricePerKg, useForfait: !offline } : { kind: l.kind, grams: l.kind === "FORFAIT" ? l.grams : 0 }))), [balance, lines, offline]);
  const priced = useMemo(() => lines.map((l, i) => (l.kind === "PIECE" ? { unitPrice: l.unitPrice, quantity: l.quantity }
    : l.kind === "FORFAIT" ? { unitPrice: l.price, quantity: 1, noSurcharge: true } : { unitPrice: alloc.lines[i]?.price ?? 0, quantity: 1 })), [lines, alloc]);
  const totals = useMemo(() => computeOrderTotals(priced, { isExpress, expressRatePct: settings.expressRatePct, discount }),
    [priced, isExpress, settings.expressRatePct, discount]);
  const hasKilo = lines.some((l) => l.kind === "KILO");
  const onlyForfaits = lines.length > 0 && lines.every((l) => l.kind === "FORFAIT");
  const autoDue = computeDueAt(openedAt, { isExpress, standardHours: settings.standardDelayHours, expressHours: settings.expressDelayHours });
  const dueValue = dueEdited ?? toDateTimeLocal(autoDue);
  const discountTooHigh = !isAdmin && totals.discountPct > settings.agentMaxDiscountPct + 1e-9;
  const depositTooHigh = (deposit ?? 0) > totals.total;
  const depositBlocked = (deposit ?? 0) > 0 && !hasOpenSession;
  const pieces = lines.reduce((s, l) => s + (l.kind === "PIECE" ? l.quantity : 0), 0);
  const kilos = lines.reduce((s, l) => s + (l.kind === "KILO" ? l.grams : 0), 0);
  const countLabel = [pieces ? `${pieces} pièce${pieces > 1 ? "s" : ""}` : "", kilos ? formatKg(kilos) : ""].filter(Boolean).join(" · ");
  // Vente de forfait seule : elle se règle entièrement tout de suite.
  const forfaitUnpaid = onlyForfaits && (deposit ?? 0) < totals.total;

  function addLine(itemTypeId: string, serviceId: string) {
    const p = priceRow(itemTypeId, serviceId);
    if (!p) return;
    const item = catalog.items.find((i) => i.id === itemTypeId)!;
    const svc = catalog.services.find((s) => s.id === serviceId)!;
    setLines((ls) => {
      const same = ls.find((l): l is PieceLine => l.kind === "PIECE" && l.itemTypeId === itemTypeId && l.serviceId === serviceId && l.maxPrice === null && !l.description && !l.color && !l.brand && !l.observations);
      if (same) return ls.map((l) => (l === same ? { ...same, quantity: same.quantity + 1 } : l));
      return [...ls, { key: crypto.randomUUID(), kind: "PIECE", itemTypeId, serviceId, itemLabel: item.name, serviceLabel: svc.shortName, unitPrice: p.amount,
        minPrice: p.amount, maxPrice: p.maxAmount ?? null, quantity: 1, description: "", color: "", brand: "", observations: "", open: false }];
    });
    setPickedItem(null);
    setItemQuery("");
  }
  /** Un article proposé dans un seul service s'ajoute directement ; sinon on choisit le service. */
  function pickItem(itemTypeId: string) {
    const svcs = servicesOf(itemTypeId);
    if (svcs.length === 1) addLine(itemTypeId, svcs[0].id); else setPickedItem(itemTypeId);
  }
  const updateLine = (key: string, patch: Partial<PieceLine> | Partial<KiloLine>) => setLines((ls) => ls.map((l) => (l.key === key ? ({ ...l, ...patch } as Line) : l)));
  const kgGrams = parseKg(kgText);
  function addKilo() {
    const k = kiloTypes.find((x) => x.id === kiloTypeId);
    if (!kgGrams || !k) return;
    setLines((ls) => [...ls, { key: crypto.randomUUID(), kind: "KILO", kiloTypeId: k.id, typeName: k.name, pricePerKg: k.pricePerKg, grams: kgGrams, description: kgDesc.trim(), observations: "" }]);
    setKgText(""); setKgDesc("");
  }
  const addForfait = (f: DepositForfait) => setLines((ls) => [...ls, { key: crypto.randomUUID(), kind: "FORFAIT", forfaitId: f.id, name: f.name, price: f.price, grams: f.grams }]);

  const badPrice = lines.some((l) => l.kind === "PIECE" && l.maxPrice !== null && (l.unitPrice < l.minPrice || l.unitPrice > l.maxPrice || l.unitPrice % 100 !== 0));
  const canNext: Record<Step, boolean> = { client: !!customer, articles: lines.length > 0 && !badPrice && !(hasKilo && !!customer && balance === null && !offline), options: !discountTooHigh, paiement: true };
  const blockedReason = offline?.blockedReason ?? (offline && lines.some((l) => l.kind === "FORFAIT") ? "Achat de forfait : connexion internet nécessaire." : null);
  const canSubmit = !!customer && canNext.articles && !discountTooHigh && !depositTooHigh && !depositBlocked && !blockedReason && !forfaitUnpaid;

  async function submit() {
    if (!customer) { setStep("client"); return; }
    const dueDate = fromDateTimeLocal(dueValue);
    const send = (input: CreateOrderInput) => (offline ? offline.submit(input) : createOrder(input));
    await exec(() => send({
      idempotencyKey,
      customerId: customer.id,
      lines: lines.map((l): OrderLineInput => (l.kind === "PIECE"
        ? { kind: "PIECE", itemTypeId: l.itemTypeId, serviceId: l.serviceId, quantity: l.quantity, unitPrice: l.maxPrice !== null ? l.unitPrice : null, description: l.description, color: l.color, brand: l.brand, observations: l.observations }
        : l.kind === "KILO" ? { kind: "KILO", kiloTypeId: l.kiloTypeId, grams: l.grams, useForfait: !offline, description: l.description, observations: l.observations }
        : { kind: "FORFAIT", forfaitId: l.forfaitId })),
      isExpress,
      dueAt: dueEdited && !Number.isNaN(dueDate.getTime()) ? dueDate.toISOString() : null,
      discount,
      notes,
      deposit: deposit ? { idempotencyKey: depositKey, amount: deposit, method, reference: method === "ESPECES" ? "" : reference } : null,
    }), { onSuccess: (d) => {
      try { localStorage.removeItem(draftKey); } catch { /* rien */ }
      if (offline) offline.onDone(d); else router.push(`/depot/confirmation/${d.id}`);
    } });
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

      {restored && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-2.5 text-sm">
          <span className="flex-1 text-ink-2">Brouillon repris : le dépôt en cours a été conservé.</span>
          <button type="button" onClick={resetDraft} className="flex items-center gap-1.5 font-medium text-brand"><RotateCcw className="size-4" />Recommencer</button>
        </div>
      )}

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
            <div className="mb-4 grid grid-cols-2 rounded-lg border border-line-2 p-1" role="tablist" aria-label="Type de dépôt">
              {([["PIECE", "À la pièce", Shirt], ["KILO", "Au kilo", Scale]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={cn("flex h-10 items-center justify-center gap-2 rounded-md text-[14.5px] font-medium transition", mode === m ? "bg-brand text-white" : "text-ink-2 hover:bg-subtle")}>
                  <Icon className="size-4" />{label}
                </button>
              ))}
            </div>
            {mode === "KILO" ? (
              <KiloPanel offline={!!offline} customer={customer} balance={balance} alloc={alloc} lines={lines} forfaits={forfaits}
                kiloTypes={kiloTypes} kiloTypeId={kiloTypeId} setKiloTypeId={setKiloTypeId} kgText={kgText} setKgText={setKgText} kgDesc={kgDesc} setKgDesc={setKgDesc} kgGrams={kgGrams} onAdd={addKilo} onForfait={addForfait} />
            ) : (<>
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
                <ItemGrid items={filtered ?? frequent} picked={pickedItem} onPick={pickItem} lines={lines} />
              </>
            )}
            {!filtered && others.length > 0 && (
              <details className="group mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
                  <ChevronDown className="size-4 transition group-open:rotate-180" /> Autres articles ({others.length})
                </summary>
                <div className="mt-3"><ItemGrid items={others} picked={pickedItem} onPick={pickItem} lines={lines} /></div>
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
                        <span className="text-sm font-semibold text-brand tnum"><Money value={p} unit={false} />{priceRow(pickedItem, s.id)?.maxAmount != null && <> – <Money value={priceRow(pickedItem, s.id)!.maxAmount!} unit={false} /></>}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </>
            )}
            </>)}
          </section>
        </div>

        {/* Colonne droite : panier collant */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <section className={cn(vis("articles"), "rounded-lg border border-line bg-surface shadow-card")}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-semibold">Panier</h2>
              <span className="text-sm text-ink-3 tnum">{countLabel || "Vide"}</span>
            </div>
            {lines.length === 0 ? (
              <p className="border-t border-line px-5 py-8 text-center text-sm text-ink-3">Touchez un article pour l&apos;ajouter, ou pesez le linge dans « Au kilo ».</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {lines.map((l, idx) => {
                  if (l.kind !== "PIECE") return <SpecialLine key={l.key} line={l} alloc={alloc.lines[idx]} onChange={(patch) => updateLine(l.key, patch)} onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />;
                  const hasObs = !!(l.color || l.brand || l.observations);
                  return (
                    <li key={l.key} className="px-4 py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-medium">{l.itemLabel}</p>
                          <p className="text-[13px] text-ink-3">{l.serviceLabel} · <Money value={l.unitPrice} unit={false} /> l&apos;unité{l.maxPrice !== null && <> (prix de <Money value={l.minPrice} unit={false} /> à <Money value={l.maxPrice} unit={false} />)</>}</p>
                        </div>
                        <Money value={l.unitPrice * l.quantity} unit={false} className="pt-0.5 text-right text-[15px] font-semibold" />
                      </div>
                      {l.maxPrice !== null && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {priceSteps(l.minPrice, l.maxPrice).map((v) => (
                            <button key={v} type="button" onClick={() => updateLine(l.key, { unitPrice: v })}
                              className={cn("h-8 rounded-full border px-2.5 text-[13px] font-medium tnum", l.unitPrice === v ? "border-brand bg-brand-50 text-brand" : "border-line-2 text-ink-2 hover:bg-subtle")}>
                              <Money value={v} unit={false} />
                            </button>
                          ))}
                          <div className="w-32"><AmountInput value={l.unitPrice} onChange={(v) => updateLine(l.key, { unitPrice: v ?? l.minPrice })} aria-label={`Prix de ${l.itemLabel}`}
                            aria-invalid={l.unitPrice < l.minPrice || l.unitPrice > l.maxPrice || l.unitPrice % 100 !== 0} /></div>
                        </div>
                      )}
                      <Input value={l.description} onChange={(e) => updateLine(l.key, { description: e.target.value.slice(0, 120) })}
                        placeholder="Description (ex. bleu à rayures, manches longues)" aria-label={`Description de ${l.itemLabel}`} className="mt-2 h-10 text-[14px]" />
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
                <Row label={`Sous-total${countLabel ? ` (${countLabel})` : ""}`}><Money value={totals.subtotal} /></Row>
                {totals.expressAmount > 0 && <Row label={`Express +${settings.expressRatePct} %`}><Money value={totals.expressAmount} /></Row>}
                {totals.discountAmount > 0 && <Row label="Remise"><span className="text-success">−<Money value={totals.discountAmount} /></span></Row>}
              </dl>
              <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
                <span className="font-semibold">Total</span>
                <Money value={totals.total} className="text-[28px] font-semibold tracking-[-0.02em]" />
              </div>
            </div>
            <div className="space-y-3 border-t border-line bg-canvas/50 p-5">
              <Field label={onlyForfaits ? "Paiement du forfait" : "Acompte (facultatif)"} error={depositTooHigh ? "L'acompte dépasse le total." : forfaitUnpaid && (deposit ?? 0) > 0 ? "Un forfait se règle entièrement à l'achat." : undefined}
                hint={onlyForfaits && !deposit ? "Un forfait se règle entièrement à l'achat : touchez « Tout »." : undefined}>
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
                  {!customer ? "Choisissez un client." : lines.length === 0 ? "Ajoutez au moins un article." : forfaitUnpaid ? "Encaissez la totalité du forfait." : "Corrigez les champs signalés."}
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
            <p className="text-[12px] text-ink-3">Total{countLabel && ` · ${countLabel}`}</p>
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

/** Ligne de linge au kilo ou d'achat de forfait dans le panier. */
function SpecialLine({ line: l, alloc, onChange, onRemove }: {
  line: KiloLine | ForfaitLine; alloc: { covered: number; uncovered: number; price: number } | null | undefined;
  onChange: (patch: Partial<KiloLine>) => void; onRemove: () => void;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-2">
        <Scale className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug">{l.kind === "KILO" ? `${l.typeName} · ${formatKg(l.grams)}` : l.name}</p>
          <p className="text-[13px] text-ink-3">
            {l.kind === "FORFAIT" ? <>Achat de forfait · +{formatKg(l.grams)} au solde</>
              : !alloc || alloc.covered === 0 ? <>{formatKg(l.grams)} × <Money value={l.pricePerKg} unit={false} /> FCFA/kg</>
              : alloc.uncovered > 0 ? <>{formatKg(alloc.covered)} déduits du forfait · {formatKg(alloc.uncovered)} × <Money value={l.pricePerKg} unit={false} /> FCFA/kg</>
              : "Déduit du solde forfait"}
          </p>
        </div>
        {l.kind === "KILO" && !alloc?.price ? <span className="pt-0.5 text-[14px] font-medium text-success">inclus</span>
          : <Money value={l.kind === "FORFAIT" ? l.price : (alloc?.price ?? 0)} unit={false} className="pt-0.5 text-right text-[15px] font-semibold" />}
        <button type="button" onClick={onRemove} aria-label="Retirer la ligne" className="-mt-1 grid size-10 place-items-center rounded-md text-ink-3 hover:bg-danger-50 hover:text-danger"><Trash2 className="size-[18px]" /></button>
      </div>
      {l.kind === "KILO" && (
        <Input value={l.description} onChange={(e) => onChange({ description: e.target.value.slice(0, 120) })} placeholder="Description (ex. sac bleu, linge de maison)"
          aria-label="Description du linge au kilo" className="mt-2 h-10 text-[14px]" />
      )}
    </li>
  );
}

/** Saisie du linge au kilo : type de linge (prix du kilo), poids ; solde forfait du client et achat de forfait. */
function KiloPanel({ offline, customer, balance, alloc, lines, forfaits, kiloTypes, kiloTypeId, setKiloTypeId, kgText, setKgText, kgDesc, setKgDesc, kgGrams, onAdd, onForfait }: {
  offline: boolean; customer: PickedCustomer | null; balance: number | null; alloc: ReturnType<typeof allocateKilo>; lines: Line[]; forfaits: DepositForfait[];
  kiloTypes: DepositCatalog["kiloTypes"]; kiloTypeId: string | null; setKiloTypeId: (id: string) => void;
  kgText: string; setKgText: (v: string) => void; kgDesc: string; setKgDesc: (v: string) => void;
  kgGrams: number | null; onAdd: () => void; onForfait: (f: DepositForfait) => void;
}) {
  if (kiloTypes.length === 0) return <p className="rounded-md bg-warning-50 px-3 py-2 text-sm text-[#8a5300]">Aucun type de linge au kilo. Le gérant doit les créer (Paramètres › Catalogue).</p>;
  const type = kiloTypes.find((k) => k.id === kiloTypeId) ?? kiloTypes[0];
  const bought = lines.reduce((a, l) => a + (l.kind === "FORFAIT" ? l.grams : 0), 0);
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow mb-2">Type de linge</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {kiloTypes.map((k) => (
            <button key={k.id} type="button" onClick={() => setKiloTypeId(k.id)} aria-pressed={type.id === k.id}
              className={cn("flex min-h-14 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition",
                type.id === k.id ? "border-brand bg-brand-50 ring-3 ring-brand/12" : "border-line-2 bg-surface hover:bg-canvas")}>
              <span className="text-[14px] font-medium leading-tight">{k.name}</span>
              <span className="text-[12.5px] text-ink-3 tnum"><Money value={k.pricePerKg} unit={false} /> FCFA/kg</span>
            </button>
          ))}
        </div>
      </div>
      <form className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); onAdd(); }}>
        <div className="relative">
          <Input inputMode="decimal" value={kgText} onChange={(e) => setKgText(e.target.value)} placeholder="Poids" aria-label="Poids en kg" className="pr-10 text-right tnum" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">kg</span>
        </div>
        <Input value={kgDesc} onChange={(e) => setKgDesc(e.target.value.slice(0, 120))} placeholder="Description (facultatif)" aria-label="Description" />
        <Button type="submit" disabled={!kgGrams}><Plus />Ajouter</Button>
      </form>
      {kgGrams ? <p className="text-[13px] text-ink-3">{formatKg(kgGrams)} × <Money value={type.pricePerKg} unit={false} /> = <span className="font-medium text-ink"><Money value={kiloLinePrice(kgGrams, type.pricePerKg)} /></span></p> : null}
      {offline ? (
        <p className="rounded-md bg-canvas px-3 py-2 text-[13px] text-ink-3">Hors ligne : le solde forfait du client n&apos;est pas déduit et les forfaits ne se vendent qu&apos;en ligne.</p>
      ) : customer && (
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink-2">Solde forfait · {customer.fullName}</span>
            <span className="font-semibold tnum">{balance === null ? "…" : formatKg(balance)}{bought > 0 && <span className="text-success"> +{formatKg(bought)}</span>}</span>
          </div>
          {(balance ?? 0) + bought > 0 && <p className="text-[13px] text-ink-3">Les kilos sont déduits du forfait en priorité. Restera : <span className="font-medium text-ink tnum">{formatKg(Math.max(0, alloc.balanceAfter))}</span></p>}
          {forfaits.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Vendre un forfait</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {forfaits.map((f) => (
                  <button key={f.id} type="button" onClick={() => onForfait(f)}
                    className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-line-2 bg-surface px-3.5 py-2 text-left transition hover:border-brand hover:ring-3 hover:ring-brand/10">
                    <span className="text-[14.5px] font-medium leading-tight">{formatKg(f.grams)}</span>
                    <Money value={f.price} unit={false} className="text-sm font-semibold text-brand" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ItemGrid({ items, picked, onPick, lines }: { items: { id: string; name: string }[]; picked: string | null; onPick: (id: string) => void; lines: Line[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 xl:grid-cols-4">
      {items.map((i) => {
        const count = lines.reduce((s, l) => s + (l.kind === "PIECE" && l.itemTypeId === i.id ? l.quantity : 0), 0);
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
