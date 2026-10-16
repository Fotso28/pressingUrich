"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Banknote, CheckCircle2, ClipboardList, CloudOff, CloudUpload, Lock, PackageCheck, PackagePlus, Plus, Printer, RefreshCw, Search, Wallet, Wifi,
} from "lucide-react";
import { DepositForm } from "@/app/(app)/depot/nouveau/deposit-form";
import type { CreateOrderInput } from "@/server/actions/orders";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input, Textarea } from "@/components/ui/field";
import { Money } from "@/components/money";
import { MethodPicker } from "@/components/cash/method-picker";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/cn";
import { computeDueAt, formatDate, formatDateTime } from "@/lib/domain/dates";
import { EXPENSE_CATEGORIES, METHOD_LABEL, METHODS, type Method } from "@/lib/domain/cash";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatPhone, normalizeName } from "@/lib/domain/normalize";
import { isExpired, loadState, perform, subscribe, syncNow, type OfflineState } from "@/lib/offline/store";
import { OP_LABEL, REFILL_WHEN_LEFT, type OfflineOrder } from "@/lib/offline/types";
import { OfflineCustomerPicker } from "./customer-picker";
import { offlinePrintCss, useOfflinePrint } from "./offline-ticket";

type Tab = "caisse" | "depot" | "commandes";
const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const STATUS_LABEL: Record<OfflineOrder["status"], string> = { DEPOSEE: "Déposée", EN_TRAITEMENT: "En traitement", PRETE: "Prête", RETIREE: "Retirée" };

export function OfflineApp() {
  const [state, setState] = useState<OfflineState | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("depot");
  const [syncing, setSyncing] = useState(false);
  const online = useOnlineStatus(15000);

  useEffect(() => {
    // Servie à la place d'une autre page (sans réseau) : on se place sur sa propre adresse, sinon le routeur
    // de Next rechargerait l'application au retour du réseau et la saisie en cours serait perdue.
    if (window.location.pathname !== "/hors-ligne") { window.location.replace("/hors-ligne"); return; }
    loadState().then(setState);
    return subscribe(setState);
  }, []);

  const sync = useCallback(async (quiet = false) => {
    setSyncing(true);
    const r = await syncNow();
    setSyncing(false);
    if (quiet) return;
    for (const n of r.renumbered) toast.warning(`Ticket n° ${n.from} enregistré sous le n° ${n.to} : corrigez le ticket du client.`, { duration: Infinity, closeButton: true });
    if (r.otherAccount) toast.error("Ces opérations ont été saisies avec un autre compte : reconnectez-vous avec ce compte pour les envoyer.", { duration: Infinity, closeButton: true });
    else if (r.unauthorized) toast.error("Session expirée : reconnectez-vous pour envoyer les opérations.", { duration: Infinity, closeButton: true });
    else if (r.offline) toast.error("Toujours pas de connexion au serveur.");
    else if (r.failed) toast.warning(`${r.ok} opération(s) envoyée(s), ${r.failed} refusée(s).`, { duration: 8000 });
    else toast.success(r.sent ? `${r.ok} opération(s) synchronisée(s).` : "Données à jour.");
  }, []);

  // Au retour du réseau : envoi automatique de la file.
  useEffect(() => {
    if (!online) return;
    void syncNow();
    // Tant que des opérations attendent, nouvel essai chaque minute (réseau revenu mais serveur pas encore joignable…).
    const id = setInterval(() => { void loadState().then((s) => { if (s?.queue.length) void syncNow(); }); }, 60_000);
    return () => clearInterval(id);
  }, [online]);

  const { print, node } = useOfflinePrint(state?.settings ?? { shopName: "", address: null, phones: null, ticketFooter: null, website: null, paperFormat: "THERMAL_80", standardDelayHours: 48, expressDelayHours: 24, expressRatePct: 50 });

  if (state === undefined) return <div className="grid min-h-dvh place-items-center text-ink-3">Chargement…</div>;
  if (!state) return <Blocked online={online} title="Mode hors ligne pas encore prêt" text="Connectez-vous une première fois avec internet sur cet appareil : l'application copiera le catalogue, les clients et vos numéros de ticket pour travailler ensuite sans connexion." />;
  if (isExpired(state)) return <Blocked online={online} title="Session hors ligne expirée" text="Pour des raisons de sécurité, reconnectez-vous avec internet pour continuer. Les opérations non envoyées sont conservées." pending={state.queue.length} />;

  const pending = state.queue.length;
  const noNumbers = state.numbers.length === 0;

  return (
    <div className="min-h-dvh bg-canvas">
      <style>{offlinePrintCss(state.settings.paperFormat)}</style>
      {node}
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Continental Pressing" className="h-8 w-auto" />
          <span className={cn("ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium", online ? "bg-success-50 text-[#12813c]" : "bg-warning-50 text-[#8a5300]")}>
            {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}{online ? "En ligne" : "Hors ligne"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {pending > 0 && <span className="hidden text-[13px] text-ink-3 sm:inline">{pending} à envoyer</span>}
            {online && <Button size="sm" variant="secondary" loading={syncing} onClick={() => sync()}>{!syncing && <RefreshCw />}<span className="hidden sm:inline">Synchroniser</span></Button>}
            {/* Navigation complète (pas de routeur client) : on quitte la page hors ligne pour l'application serveur. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            {online && pending === 0 && <Button size="sm" asChild><a href="/">Application</a></Button>}
          </div>
        </div>
        <nav className="mx-auto grid max-w-5xl grid-cols-3 gap-1 px-4 pb-2">
          {([["depot", "Nouveau dépôt", "Dépôt", PackagePlus], ["commandes", "Commandes", "Commandes", ClipboardList], ["caisse", "Caisse", "Caisse", Wallet]] as const).map(([k, label, short, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-label={label} className={cn("flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md text-[14px] font-medium", tab === k ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-subtle")}>
              <Icon className="size-[18px] shrink-0" /><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-4">
        <div className="mb-4 space-y-2">
          {!online && <Notice tone="info" icon={<CloudOff className="size-4" />}>Mode hors ligne : {state.user.name} · caisse, dépôts, encaissements et retraits enregistrés sur cet appareil{pending ? ` (${pending} en attente d'envoi)` : ""}. Envoi automatique au retour du réseau.</Notice>}
          {noNumbers
            ? <Notice tone="danger" icon={<Lock className="size-4" />}>Plus aucun numéro de ticket disponible : connectez-vous à internet pour obtenir de nouveaux numéros avant d&apos;enregistrer un dépôt.</Notice>
            : state.numbers.length <= REFILL_WHEN_LEFT && !online && <Notice tone="warning" icon={<AlertTriangle className="size-4" />}>Plus que {state.numbers.length} numéro(s) de ticket hors ligne. Reconnectez-vous dès que possible pour en recevoir de nouveaux.</Notice>}
          {state.failed.length > 0 && <FailedOps state={state} />}
        </div>
        {tab === "depot" && <DepositTab state={state} onOpenCash={() => setTab("caisse")} print={print} />}
        {tab === "commandes" && <OrdersTab state={state} print={print} />}
        {tab === "caisse" && <CashTab state={state} />}
      </main>
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: "info" | "warning" | "danger"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-md px-3 py-2.5 text-[13.5px]",
      tone === "danger" ? "bg-danger-50 font-medium text-danger" : tone === "warning" ? "bg-warning-50 text-[#8a5300]" : "bg-brand-50 text-brand-700")}>
      <span className="mt-0.5 shrink-0">{icon}</span><span>{children}</span>
    </p>
  );
}

function Blocked({ online, title, text, pending }: { online: boolean; title: string; text: string; pending?: number }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 text-center shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Continental Pressing" className="mx-auto mb-5 h-12 w-auto" />
        <CloudOff className="mx-auto size-8 text-ink-3" />
        <h1 className="mt-3 text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-ink-2">{text}</p>
        {!!pending && <p className="mt-2 text-sm font-medium text-warning">{pending} opération(s) en attente d&apos;envoi.</p>}
        {online ? <Button asChild className="mt-5"><a href="/login">Se connecter</a></Button> : <p className="mt-5 text-sm text-ink-3">En attente d&apos;une connexion internet…</p>}
      </div>
    </main>
  );
}

function FailedOps({ state }: { state: OfflineState }) {
  return (
    <details className="rounded-md bg-danger-50 px-3 py-2.5 text-[13.5px] text-danger">
      <summary className="cursor-pointer font-medium">{state.failed.length} opération(s) refusée(s) par le serveur — voir le détail</summary>
      <ul className="mt-2 space-y-1">
        {state.failed.map((f) => <li key={f.op.opId}>{formatDateTime(f.op.at)} · {OP_LABEL[f.op.type]} : {f.error}</li>)}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Dépôt
// ---------------------------------------------------------------------------

function DepositTab({ state, onOpenCash, print }: { state: OfflineState; onOpenCash: () => void; print: (o: OfflineOrder, k: "ticket" | "recu", agent: string) => void }) {
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<OfflineOrder | null>(null);
  if (done) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h2 className="mt-3 text-xl font-semibold">Dépôt enregistré · Ticket n° {formatOrderNumber(done.number)}</h2>
        <p className="mt-1 text-sm text-ink-3">{done.customerName} · <Money value={done.total} /> · enregistré sur cet appareil</p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button onClick={() => print(done, "ticket", state.user.name)}><Printer />Imprimer le ticket</Button>
          <Button variant="secondary" onClick={() => { setDone(null); setRound((r) => r + 1); }}><Plus />Nouveau dépôt</Button>
        </div>
      </Card>
    );
  }
  async function submit(input: CreateOrderInput) {
    const s = state;
    const number = s.numbers[0];
    if (!number) return { ok: false as const, error: "Plus de numéro de ticket : connectez-vous à internet pour obtenir de nouveaux numéros." };
    if (input.deposit && !s.session) return { ok: false as const, error: "Ouvrez votre caisse avant d'encaisser un acompte." };
    if (input.lines.some((l) => l.kind !== "PIECE")) return { ok: false as const, error: "Linge au kilo et forfaits : connexion internet nécessaire (solde du client)." };
    const id = uuid(), at = nowIso();
    const dueAt = input.dueAt ?? computeDueAt(new Date(), { isExpress: input.isExpress, standardHours: s.settings.standardDelayHours, expressHours: s.settings.expressDelayHours }).toISOString();
    const next = await perform({
      type: "CREATE_ORDER", opId: uuid(), at, id, number, customerId: input.customerId, isExpress: input.isExpress, dueAt, notes: input.notes || null,
      lines: input.lines.flatMap((l) => (l.kind === "PIECE" ? [{ itemTypeId: l.itemTypeId, serviceId: l.serviceId, quantity: l.quantity, unitPrice: l.unitPrice ?? null, description: l.description || null, color: l.color || null, brand: l.brand || null, observations: l.observations || null }] : [])),
      deposit: input.deposit && s.session ? { paymentId: uuid(), sessionId: s.session.id, amount: input.deposit.amount, method: input.deposit.method, reference: input.deposit.reference || null } : null,
    });
    setDone(next.orders.find((o) => o.id === id) ?? null);
    return { ok: true as const, data: { id, number } };
  }
  return (
    <DepositForm key={round} catalog={state.catalog} draftKey={`cp-depot-brouillon-hl:${state.user.id}`} initialCustomer={null} hasOpenSession={!!state.session} isAdmin={false}
      settings={{ ...state.settings, agentMaxDiscountPct: 0 }}
      offline={{
        customerPicker: (value, onChange) => (
          <OfflineCustomerPicker customers={state.customers} value={value} onChange={onChange}
            onCreate={async (c) => {
              const id = uuid();
              await perform({ type: "CREATE_CUSTOMER", opId: uuid(), at: nowIso(), id, fullName: c.fullName, phone: c.phone });
              return { id, fullName: c.fullName, phone: c.phone };
            }} />
        ),
        submit, onDone: () => undefined, onOpenCash,
        blockedReason: state.numbers.length === 0 ? "Plus aucun numéro de ticket : connectez-vous à internet pour obtenir de nouveaux numéros." : null,
      }} />
  );
}

// ---------------------------------------------------------------------------
// Commandes : encaissement, retrait, réimpression
// ---------------------------------------------------------------------------

function OrdersTab({ state, print }: { state: OfflineState; print: (o: OfflineOrder, k: "ticket" | "recu", agent: string) => void }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim();
    const n = normalizeName(t), d = t.replace(/\D/g, "");
    return state.orders.filter((o) => o.status !== "RETIREE" || o.pending)
      .filter((o) => !t || (d && (String(o.number).includes(d) || o.customerPhone.replace(/\D/g, "").includes(d))) || (n && normalizeName(o.customerName).includes(n)));
  }, [q, state.orders]);
  const open = state.orders.find((o) => o.id === openId) ?? null;
  return (
    <Card>
      <CardHeader title="Commandes en cours" description={`${list.length} commande(s) · copie locale du ${formatDateTime(state.savedAt)}`} />
      <div className="relative border-t border-line px-4 py-3">
        <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="N° de ticket, nom ou téléphone" className="pl-9" aria-label="Rechercher une commande" />
      </div>
      {list.length === 0 ? <EmptyState title="Aucune commande" /> : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((o) => {
            const rest = o.total - o.amountPaid;
            return (
              <li key={o.id}>
                <button onClick={() => setOpenId(o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
                  <span className="w-16 shrink-0 font-semibold tnum">{formatOrderNumber(o.number)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.customerName}</span>
                    <span className="block text-[13px] text-ink-3">{STATUS_LABEL[o.status]} · retrait prévu {formatDate(o.dueAt)}{o.pending && " · non synchronisée"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money value={o.total} strong />
                    <span className={cn("block text-[12.5px]", rest > 0 ? "text-warning" : "text-success")}>{rest > 0 ? <>Reste <Money value={rest} unit={false} /></> : "Soldée"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <OrderDialog state={state} order={open} onClose={() => setOpenId(null)} print={print} />}
    </Card>
  );
}

function OrderDialog({ state, order: o, onClose, print }: { state: OfflineState; order: OfflineOrder; onClose: () => void; print: (o: OfflineOrder, k: "ticket" | "recu", agent: string) => void }) {
  const rest = o.total - o.amountPaid;
  const [amount, setAmount] = useState<number | null>(rest > 0 ? rest : null);
  const [method, setMethod] = useState<Method>("ESPECES");
  const [confirmNotReady, setConfirmNotReady] = useState(false);
  const pay = async () => {
    if (!state.session) return toast.error("Ouvrez votre caisse (onglet Caisse) pour encaisser.");
    if (!amount || amount > rest) return toast.error("Montant invalide.");
    await perform({ type: "ADD_PAYMENT", opId: uuid(), at: nowIso(), paymentId: uuid(), orderId: o.id, sessionId: state.session.id, amount, method, reference: null });
    toast.success("Encaissement enregistré.");
    setAmount(null);
  };
  const notReadyBlocked = o.status !== "PRETE" && state.user.role !== "ADMIN";
  const collect = async () => {
    if (notReadyBlocked) return;
    if (o.status !== "PRETE" && !confirmNotReady) { setConfirmNotReady(true); return; }
    await perform({ type: "COLLECT_ORDER", opId: uuid(), at: nowIso(), orderId: o.id });
    toast.success("Retrait enregistré.");
    onClose();
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Ticket n° ${formatOrderNumber(o.number)}`} description={`${o.customerName} · ${formatPhone(o.customerPhone)}`}>
        <ul className="space-y-1 text-[14px]">
          {o.items.map((i, k) => <li key={k} className="flex justify-between gap-3"><span>{i.quantity} × {i.itemLabel} <span className="text-ink-3">{i.serviceLabel}</span>{i.description && <span className="block text-[13px] text-ink-3">{i.description}</span>}</span><Money value={i.lineTotal} unit={false} /></li>)}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-[14px]">
          <div className="flex justify-between"><dt>Total</dt><dd><Money value={o.total} strong /></dd></div>
          <div className="flex justify-between"><dt>Payé</dt><dd><Money value={o.amountPaid} /></dd></div>
          <div className="flex justify-between font-semibold"><dt>Reste à payer</dt><dd><Money value={rest} /></dd></div>
          <div className="flex justify-between text-ink-3"><dt>Statut</dt><dd>{STATUS_LABEL[o.status]}</dd></div>
        </dl>
        {o.status !== "RETIREE" && rest > 0 && (
          <div className="mt-4 space-y-3 rounded-lg border border-line p-3">
            <Field label="Encaisser"><AmountInput value={amount} onChange={setAmount} /></Field>
            <MethodPicker value={method} onChange={setMethod} />
            <Button block onClick={pay} disabled={!amount || amount > rest}><Banknote />Encaisser <Money value={amount ?? 0} unit={false} /></Button>
          </div>
        )}
        {notReadyBlocked && o.status !== "RETIREE" && <p className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm text-[#8a5300]">Commande pas encore prête : seul le gérant peut la remettre au client.</p>}
        {confirmNotReady && <p className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-sm text-[#8a5300]">Cette commande n&apos;est pas marquée « prête ». Touchez à nouveau pour confirmer la remise au client.</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => print(o, o.status === "RETIREE" ? "recu" : "ticket", state.user.name)}><Printer />{o.status === "RETIREE" ? "Reçu" : "Ticket"}</Button>
          {o.status !== "RETIREE" && <Button onClick={collect} disabled={rest > 0 || notReadyBlocked} title={rest > 0 ? "Encaissez le solde d'abord" : undefined}><PackageCheck />{confirmNotReady ? "Confirmer le retrait" : "Remettre au client"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Caisse : ouverture, dépenses, clôture
// ---------------------------------------------------------------------------

function CashTab({ state }: { state: OfflineState }) {
  const s = state.session;
  const [float, setFloat] = useState<number | null>(null);
  const [dlg, setDlg] = useState<null | "expense" | "close">(null);
  if (!s) {
    return (
      <Card className="mx-auto max-w-md p-6">
        <h2 className="text-lg font-semibold">Votre caisse n&apos;est pas ouverte</h2>
        <p className="mt-1 text-sm text-ink-2">Saisissez le fond de caisse en espèces pour pouvoir encaisser.</p>
        <form className="mt-4 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          await perform({ type: "OPEN_CASH", opId: uuid(), at: nowIso(), sessionId: uuid(), openingFloat: float ?? 0 });
          toast.success("Caisse ouverte.");
        }}>
          <div className="flex-1"><AmountInput value={float} onChange={setFloat} placeholder="Fond de caisse" aria-label="Fond de caisse" /></div>
          <Button type="submit">Ouvrir</Button>
        </form>
      </Card>
    );
  }
  const rows = METHODS.map((m) => ({ m, float: m === "ESPECES" ? s.openingFloat : 0, in: s.received[m], out: s.spent[m] })).map((r) => ({ ...r, expected: r.float + r.in - r.out }));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Solde attendu par mode" description={`Ouverte le ${formatDateTime(s.openedAt)}${s.pending ? " · ouverte hors ligne" : ""}`} />
        {/* Téléphone : une ligne par mode, l'attendu en évidence */}
        <ul className="divide-y divide-line border-t border-line sm:hidden">
          {rows.map((r) => (
            <li key={r.m} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{METHOD_LABEL[r.m]}</p>
                <p className="text-[12.5px] text-ink-3 tnum">fond <Money value={r.float} unit={false} /> · +<Money value={r.in} unit={false} /> · −<Money value={r.out} unit={false} /></p>
              </div>
              <div className="text-right"><p className="text-[11.5px] text-ink-3">Attendu</p><Money value={r.expected} strong /></div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto border-t border-line sm:block">
          <table className="w-full text-[14.5px]">
            <thead><tr className="text-left text-[12px] font-medium uppercase tracking-[0.04em] text-ink-3"><th className="px-4 py-2">Mode</th><th className="px-2 py-2 text-right">Fond</th><th className="px-2 py-2 text-right">Encaissé</th><th className="px-2 py-2 text-right">Dépenses</th><th className="px-4 py-2 text-right">Attendu</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.m}><td className="px-4 py-2.5">{METHOD_LABEL[r.m]}</td><td className="px-2 text-right"><Money value={r.float} unit={false} /></td><td className="px-2 text-right text-success"><Money value={r.in} unit={false} /></td><td className="px-2 text-right"><Money value={r.out} unit={false} /></td><td className="px-4 text-right"><Money value={r.expected} strong /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => setDlg("expense")}><Plus />Ajouter une dépense</Button>
        <Button onClick={() => setDlg("close")}><Lock />Clôturer la caisse</Button>
      </div>
      <Card>
        <CardHeader title="Mouvements" description={`${s.moves.length} mouvement(s)`} />
        {s.moves.length === 0 ? <EmptyState title="Aucun mouvement" /> : (
          <ul className="divide-y divide-line border-t border-line">
            {s.moves.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0"><p className="truncate font-medium">{m.label}</p><p className="text-[13px] text-ink-3">{formatDateTime(m.at)} · {METHOD_LABEL[m.method]}</p></div>
                <Money value={m.kind === "DEPENSE" ? -m.amount : m.amount} strong className={m.kind === "DEPENSE" ? "text-danger" : "text-success"} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dlg === "expense" && <ExpenseDialog sessionId={s.id} onClose={() => setDlg(null)} />}
      {dlg === "close" && <CloseDialog sessionId={s.id} expected={Object.fromEntries(rows.map((r) => [r.m, r.expected])) as Record<Method, number>} onClose={() => setDlg(null)} />}
    </div>
  );
}

function ExpenseDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [method, setMethod] = useState<Method>("ESPECES");
  const [amount, setAmount] = useState<number | null>(null);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Dépense de caisse">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!amount || label.trim().length < 2) return;
          await perform({ type: "ADD_EXPENSE", opId: uuid(), at: nowIso(), expenseId: uuid(), sessionId, label: label.trim(), category, method, amount });
          toast.success("Dépense enregistrée.");
          onClose();
        }}>
          <Field label="Libellé"><Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Lessive (sac 5 kg)" /></Field>
          <Field label="Catégorie" htmlFor="exp-cat">
            <select id="exp-cat" value={category} onChange={(e) => setCategory(e.target.value)} className="h-11 w-full rounded-md border border-line-2 bg-surface px-3">
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Montant"><AmountInput value={amount} onChange={setAmount} /></Field>
          <MethodPicker value={method} onChange={setMethod} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!amount || label.trim().length < 2}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ sessionId, expected, onClose }: { sessionId: string; expected: Record<Method, number>; onClose: () => void }) {
  const [counts, setCounts] = useState<Record<Method, number | null>>({ ESPECES: null, MTN_MOMO: null, ORANGE_MONEY: null });
  const [comment, setComment] = useState("");
  const filled = METHODS.every((m) => counts[m] !== null);
  const gap = filled && METHODS.some((m) => counts[m] !== expected[m]);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title="Clôturer la caisse" description="Comptez l'argent réellement présent pour chaque mode.">
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!filled || (gap && comment.trim().length < 3)) return;
          await perform({ type: "CLOSE_CASH", opId: uuid(), at: nowIso(), sessionId, counts: { ESPECES: counts.ESPECES!, MTN_MOMO: counts.MTN_MOMO!, ORANGE_MONEY: counts.ORANGE_MONEY! }, comment: comment.trim() || null });
          toast.success("Caisse clôturée.");
          onClose();
        }}>
          {METHODS.map((m) => (
            <Field key={m} label={`Compté ${METHOD_LABEL[m]}`} hint={<>Attendu : <Money value={expected[m]} /></>}>
              <AmountInput value={counts[m]} onChange={(v) => setCounts({ ...counts, [m]: v })} aria-label={`Compté ${METHOD_LABEL[m]}`} />
            </Field>
          ))}
          {gap && <Field label="Commentaire (écart constaté)"><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!filled || (gap && comment.trim().length < 3)}><CloudUpload />Confirmer la clôture</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
