"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, PackageCheck, Pencil, Ban, Undo2, Play, CheckCheck, Lock, X } from "lucide-react";
import { addPayment, voidPayment } from "@/server/actions/payments";
import { advanceOrderStatus, cancelOrder, collectOrder, revertOrderStatus, updateOrder } from "@/server/actions/orders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/components/money";
import { MethodPicker } from "@/components/cash/method-picker";
import { useAction } from "@/lib/use-action";
import type { Method } from "@/lib/domain/cash";
import { canCancel, nextWorkshopStatus, previousStatus, type OrderStatus } from "@/lib/domain/status";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/domain/dates";
import { cn } from "@/lib/cn";

type OrderLite = {
  id: string; number: number; status: OrderStatus; total: number; amountPaid: number; isExpress: boolean; dueAt: string; notes: string;
  discountType: "MONTANT" | "POURCENT" | null; discountValue: number;
  items: { id: string; label: string; quantity: number; color: string; brand: string; observations: string }[];
};

export function OrderActions({ order, isAdmin, hasOpenSession, cancelReason }: { order: OrderLite; isAdmin: boolean; hasOpenSession: boolean; cancelReason: string | null }) {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [dlg, setDlg] = useState<null | "pay" | "collect" | "cancel" | "revert" | "edit">(null);
  const remaining = order.total - order.amountPaid;
  const next = nextWorkshopStatus(order.status);
  const done = () => { setDlg(null); router.refresh(); };
  const closed = order.status === "ANNULEE";

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      {closed && <p className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger">Commande annulée{cancelReason ? ` : ${cancelReason}` : ""}.</p>}
      <div className="space-y-2.5">
        {next && (
          <SaveButton size="lg" block variant={next === "PRETE" ? "success" : "primary"} loading={pending && !dlg}
            onClick={() => exec(() => advanceOrderStatus([order.id]), { success: next === "PRETE" ? "Commande prête." : "Traitement démarré.", onSuccess: () => router.refresh() })}>
            {next === "PRETE" ? <CheckCheck /> : <Play />}{next === "PRETE" ? "Marquer prête" : "Démarrer le traitement"}
          </SaveButton>
        )}
        {remaining > 0 && !closed && (
          <SaveButton size="lg" block variant={order.status === "PRETE" ? "primary" : "secondary"} onClick={() => setDlg("pay")}>
            <Banknote />Encaisser {order.status === "PRETE" ? "le solde" : ""}
          </SaveButton>
        )}
        {order.status === "PRETE" && (remaining <= 0 || isAdmin) && (
          <SaveButton size="lg" block variant={remaining <= 0 ? "success" : "secondary"} onClick={() => setDlg("collect")}>
            <PackageCheck />Remettre au client{remaining > 0 ? " (solde impayé)" : ""}
          </SaveButton>
        )}
        {isAdmin && (order.status === "DEPOSEE" || order.status === "EN_TRAITEMENT") && (
          <Button size="md" block variant="ghost" onClick={() => setDlg("collect")}><PackageCheck />Forcer le retrait</Button>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <PrintButton href={`/print/ticket/${order.id}`} size="md">Ticket</PrintButton>
          {order.status === "RETIREE"
            ? <PrintButton href={`/print/recu/${order.id}`} size="md">Reçu</PrintButton>
            : <PrintButton href={`/print/etiquettes/${order.id}`} size="md">Étiquettes</PrintButton>}
        </div>
      </div>

      {(isAdmin || order.status === "DEPOSEE") && !closed && order.status !== "RETIREE" && (
        <div className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={() => setDlg("edit")}><Pencil />Modifier</Button>
          {isAdmin && canCancel(order.status) && <Button size="sm" variant="danger-ghost" onClick={() => setDlg("cancel")}><Ban />Annuler</Button>}
          {isAdmin && previousStatus(order.status) && <Button size="sm" variant="ghost" onClick={() => setDlg("revert")}><Undo2 />Étape précédente</Button>}
        </div>
      )}
      {isAdmin && order.status === "RETIREE" && (
        <div className="mt-4 border-t border-line pt-3">
          <Button size="sm" variant="ghost" onClick={() => setDlg("revert")}><Undo2 />Annuler le retrait</Button>
        </div>
      )}

      <PayDialog open={dlg === "pay"} onOpenChange={(o) => setDlg(o ? "pay" : null)} order={order} hasOpenSession={hasOpenSession} onDone={done} />
      <CollectDialog open={dlg === "collect"} onOpenChange={(o) => setDlg(o ? "collect" : null)} order={order} onDone={done} />
      <ReasonDialog open={dlg === "cancel"} onOpenChange={(o) => setDlg(o ? "cancel" : null)} title="Annuler la commande"
        description="La commande passera au statut Annulée. Cette action est tracée." confirm="Annuler la commande" danger
        onConfirm={(reason) => exec(() => cancelOrder({ orderId: order.id, reason }), { success: "Commande annulée.", onSuccess: done })} />
      <ReasonDialog open={dlg === "revert"} onOpenChange={(o) => setDlg(o ? "revert" : null)} title="Revenir à l'étape précédente"
        description="Le retour en arrière est réservé au gérant et tracé." confirm="Confirmer le retour"
        onConfirm={(reason) => exec(() => revertOrderStatus({ orderId: order.id, reason }), { success: "Statut modifié.", onSuccess: done })} />
      {dlg === "edit" && <EditDialog order={order} onClose={() => setDlg(null)} onDone={done} />}
    </div>
  );
}

function PayDialog({ open, onOpenChange, order, hasOpenSession, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; order: OrderLite; hasOpenSession: boolean; onDone: () => void }) {
  const remaining = order.total - order.amountPaid;
  const [amount, setAmount] = useState<number | null>(remaining);
  const [method, setMethod] = useState<Method>("ESPECES");
  const [reference, setReference] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const { exec, pending } = useAction();
  const tooMuch = (amount ?? 0) > remaining;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { setAmount(remaining); setKey(crypto.randomUUID()); } onOpenChange(o); }}>
      <DialogContent title="Encaisser" description={<>Reste à payer : <Money value={remaining} strong /></>}>
        {!hasOpenSession ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-md bg-warning-50 px-3 py-2.5 text-sm text-[#8a5300]"><Lock className="size-4" />Ouvrez votre caisse pour encaisser.</p>
            <Button asChild block><Link href="/caisse">Ouvrir ma caisse</Link></Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            exec(() => addPayment({ orderId: order.id, amount: amount ?? 0, method, reference: method === "ESPECES" ? "" : reference, idempotencyKey: key }),
              { success: "Paiement enregistré.", onSuccess: onDone });
          }}>
            <Field label="Montant" error={tooMuch ? "Le montant dépasse le reste à payer." : undefined}>
              <AmountInput autoFocus value={amount} onChange={setAmount} className="h-14 text-xl" aria-invalid={tooMuch} />
            </Field>
            <Field label="Mode de paiement"><MethodPicker value={method} onChange={setMethod} /></Field>
            {method !== "ESPECES" && <Field label="Référence de transaction (facultatif)"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
              <SaveButton type="submit" loading={pending} disabled={!amount || tooMuch}>Encaisser <Money value={amount ?? 0} unit={false} /></SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CollectDialog({ open, onOpenChange, order, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; order: OrderLite; onDone: () => void }) {
  const remaining = order.total - order.amountPaid;
  const forced = remaining > 0 || order.status !== "PRETE";
  const [reason, setReason] = useState("");
  const { exec, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Remettre au client" description={`Commande n° ${order.number.toString().padStart(6, "0")} — retrait total.`}>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          exec(() => collectOrder({ orderId: order.id, reason: forced ? reason : undefined }), { success: "Commande remise au client.", onSuccess: onDone });
        }}>
          {forced ? (
            <>
              <p className="rounded-md bg-warning-50 px-3 py-2.5 text-sm text-[#8a5300]">
                Retrait forcé : {[order.status !== "PRETE" && "commande non prête", remaining > 0 && <>solde impayé de <Money key="m" value={remaining} strong /></>].filter(Boolean).map((x, i) => <span key={i}>{i > 0 && ", "}{x}</span>)}.
              </p>
              <Field label="Motif (obligatoire)"><Textarea autoFocus required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
            </>
          ) : <p className="text-[15px] text-ink-2">Le client a tout payé. Confirmez la remise de ses vêtements.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <SaveButton type="submit" variant={forced ? "primary" : "success"} loading={pending} disabled={forced && reason.trim().length < 3}>Confirmer le retrait</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReasonDialog({ open, onOpenChange, title, description, confirm, danger, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirm: string; danger?: boolean; onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent title={title} description={description}>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}>
          <Field label="Motif (obligatoire)"><Textarea autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Retour</Button>
            <SaveButton type="submit" variant={danger ? "danger" : "primary"} loading={busy} disabled={reason.trim().length < 3}>{confirm}</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidPaymentButton({ paymentId, amount }: { paymentId: string; amount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { exec } = useAction();
  return (
    <>
      <button onClick={() => setOpen(true)} className="grid size-7 place-items-center rounded text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label="Annuler ce paiement" title="Annuler ce paiement">
        <X className="size-3.5" />
      </button>
      <ReasonDialog open={open} onOpenChange={setOpen} title="Annuler le paiement" danger confirm="Annuler le paiement"
        description={`Le paiement de ${amount.toLocaleString("fr-FR")} FCFA restera visible, marqué annulé.`}
        onConfirm={(reason) => exec(() => voidPayment({ paymentId, reason }), { success: "Paiement annulé.", onSuccess: () => { setOpen(false); router.refresh(); } })} />
    </>
  );
}

function EditDialog({ order, onClose, onDone }: { order: OrderLite; onClose: () => void; onDone: () => void }) {
  const [isExpress, setIsExpress] = useState(order.isExpress);
  const [due, setDue] = useState(toDateTimeLocal(new Date(order.dueAt)));
  const [discountType, setDiscountType] = useState<"MONTANT" | "POURCENT">(order.discountType ?? "MONTANT");
  const [discountValue, setDiscountValue] = useState<number | null>(order.discountValue || null);
  const [notes, setNotes] = useState(order.notes);
  const [items, setItems] = useState(order.items);
  const { exec, pending } = useAction();
  const upd = (id: string, patch: Partial<OrderLite["items"][number]>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="Modifier la commande" description="Les prix des lignes restent ceux du dépôt. La modification est tracée.">
        <form className="space-y-5" onSubmit={(e) => {
          e.preventDefault();
          exec(() => updateOrder({
            orderId: order.id, isExpress, dueAt: fromDateTimeLocal(due).toISOString(),
            discount: discountValue ? { type: discountType, value: discountValue } : null, notes,
            lines: items.map(({ id, quantity, color, brand, observations }) => ({ id, quantity, color, brand, observations })),
          }), { success: "Commande modifiée.", onSuccess: onDone });
        }}>
          <div className="space-y-3">
            {items.map((i) => (
              <div key={i.id} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{i.label}</p>
                  <Input type="number" min={1} max={999} value={i.quantity} onChange={(e) => upd(i.id, { quantity: Math.max(1, parseInt(e.target.value || "1", 10)) })} className="h-9 w-20 text-center tnum" aria-label="Quantité" />
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <Input value={i.color} onChange={(e) => upd(i.id, { color: e.target.value })} placeholder="Couleur" className="h-9" />
                  <Input value={i.brand} onChange={(e) => upd(i.id, { brand: e.target.value })} placeholder="Marque" className="h-9" />
                  <Input value={i.observations} onChange={(e) => upd(i.id, { observations: e.target.value })} placeholder="Observations" className="h-9" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Retrait prévu"><Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            <Field label="Express">
              <button type="button" onClick={() => setIsExpress(!isExpress)} className={cn("flex h-11 w-full items-center justify-between rounded-md border px-3 text-sm font-medium", isExpress ? "border-warning bg-warning-50" : "border-line-2")}>
                {isExpress ? "Oui" : "Non"}<span className={cn("h-5 w-9 rounded-full p-0.5 transition", isExpress ? "bg-warning" : "bg-line-2")}><span className={cn("block size-4 rounded-full bg-white transition", isExpress && "translate-x-4")} /></span>
              </button>
            </Field>
            <Field label="Remise">
              <div className="flex gap-2">
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "MONTANT" | "POURCENT")} className="h-11 rounded-md border border-line-2 bg-surface px-2 text-sm">
                  <option value="MONTANT">FCFA</option><option value="POURCENT">%</option>
                </select>
                <div className="flex-1"><AmountInput value={discountValue} onChange={setDiscountValue} suffix={discountType === "POURCENT" ? "%" : "FCFA"} /></div>
              </div>
            </Field>
            <Field label="Notes"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
