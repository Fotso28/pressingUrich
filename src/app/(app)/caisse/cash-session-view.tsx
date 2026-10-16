"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Lock, X, ReceiptText } from "lucide-react";
import { addExpense, closeCashSession, voidExpense } from "@/server/actions/cash";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input, Select, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { Money } from "@/components/money";
import { MethodPicker } from "@/components/cash/method-picker";
import { ReasonDialog } from "../commandes/[id]/order-actions";
import { EXPENSE_CATEGORIES, METHOD_LABEL, METHODS, type CashSummaryRow, type Method } from "@/lib/domain/cash";
import { formatOrderNumber } from "@/lib/domain/order-number";
import { formatDateTime } from "@/lib/domain/dates";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

type Summary = {
  openingFloat: number;
  rows: CashSummaryRow[];
  payments: { id: string; orderId: string; orderNumber: number; customerName: string; method: Method; amount: number; createdAt: string; voided: boolean }[];
  expenses: { id: string; label: string; category: string; method: Method; amount: number; createdAt: string; voided: boolean; voidReason: string | null }[];
};

const CATEGORIES = EXPENSE_CATEGORIES;

export function CashSessionView({ summary, isAdmin }: { summary: Summary; isAdmin: boolean }) {
  const router = useRouter();
  const [dlg, setDlg] = useState<null | "expense" | "close">(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const { exec } = useAction();
  const totalExpected = summary.rows.reduce((s, r) => s + r.expected, 0);
  const moves = [
    ...summary.payments.map((p) => ({ kind: "in" as const, ...p })),
    ...summary.expenses.map((e) => ({ kind: "out" as const, ...e })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <Card>
          <CardHeader title="Solde attendu par mode" description="Fond + encaissements − dépenses" />
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-[14.5px]">
              <thead>
                <tr className="text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3">
                  <th className="px-5 py-2.5">Mode</th><th className="px-3 py-2.5 text-right">Fond</th><th className="px-3 py-2.5 text-right">Encaissé</th><th className="px-3 py-2.5 text-right">Dépenses</th><th className="px-5 py-2.5 text-right">Attendu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summary.rows.map((r) => (
                  <tr key={r.method}>
                    <td className="px-5 py-3 font-medium">{METHOD_LABEL[r.method]}</td>
                    <td className="px-3 py-3 text-right"><Money value={r.float} unit={false} className="text-ink-2" /></td>
                    <td className="px-3 py-3 text-right"><Money value={r.received} unit={false} className="text-success" /></td>
                    <td className="px-3 py-3 text-right">{r.spent ? <span className="text-danger">−<Money value={r.spent} unit={false} /></span> : <span className="text-ink-3">—</span>}</td>
                    <td className="px-5 py-3 text-right"><Money value={r.expected} strong /></td>
                  </tr>
                ))}
                <tr className="bg-canvas/60">
                  <td className="px-5 py-3 font-semibold" colSpan={4}>Total attendu</td>
                  <td className="px-5 py-3 text-right"><Money value={totalExpected} strong className="text-brand" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-2.5">
          <SaveButton size="lg" block variant="secondary" onClick={() => setDlg("expense")}><Plus />Ajouter une dépense</SaveButton>
          <SaveButton size="lg" block onClick={() => setDlg("close")}><Lock />Clôturer la caisse</SaveButton>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Mouvements" description={`${summary.payments.length} encaissement(s) · ${summary.expenses.length} dépense(s)`} />
        {moves.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-sm text-ink-3">Aucun mouvement pour l&apos;instant.</p> : (
          <ul className="divide-y divide-line border-t border-line">
            {moves.map((m) => (
              <li key={m.kind + m.id} className={cn("flex items-center gap-4 px-5 py-3", m.voided && "opacity-55")}>
                <span className={cn("grid size-8 place-items-center rounded-full text-sm font-semibold", m.kind === "in" ? "bg-success-50 text-success" : "bg-danger-50 text-danger")}>{m.kind === "in" ? "+" : "−"}</span>
                <div className="min-w-0 flex-1">
                  {m.kind === "in" ? (
                    <Link href={`/commandes/${m.orderId}`} className={cn("font-medium hover:text-brand", m.voided && "line-through")}>N° {formatOrderNumber(m.orderNumber)} · {m.customerName}</Link>
                  ) : <p className={cn("font-medium", m.voided && "line-through")}>{m.label} <span className="font-normal text-ink-3">· {m.category}</span></p>}
                  <p className="text-[13px] text-ink-3 tnum">{formatDateTime(m.createdAt)} · {METHOD_LABEL[m.method]}{m.voided && " · annulé"}</p>
                </div>
                <Money value={m.amount} strong className={m.kind === "in" ? "text-success" : "text-danger"} />
                {isAdmin && m.kind === "out" && !m.voided && (
                  <button onClick={() => setVoidId(m.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label="Annuler la dépense"><X className="size-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ExpenseDialog open={dlg === "expense"} onOpenChange={(o) => setDlg(o ? "expense" : null)} onDone={() => { setDlg(null); router.refresh(); }} />
      {dlg === "close" && <CloseDialog rows={summary.rows} onClose={() => setDlg(null)} onDone={(id) => { setDlg(null); router.push(`/caisse/${id}?cloture=1`); }} />}
      <ReasonDialog open={!!voidId} onOpenChange={(o) => !o && setVoidId(null)} title="Annuler la dépense" description="La dépense restera visible, marquée annulée." confirm="Annuler la dépense" danger
        onConfirm={(reason) => exec(() => voidExpense({ expenseId: voidId!, reason }), { success: "Dépense annulée.", onSuccess: () => { setVoidId(null); router.refresh(); } })} />
    </>
  );
}

function ExpenseDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("Intrants");
  const [method, setMethod] = useState<Method>("ESPECES");
  const [amount, setAmount] = useState<number | null>(null);
  const { exec, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) { setLabel(""); setAmount(null); } onOpenChange(o); }}>
      <DialogContent title="Nouvelle dépense" description="Sortie d'argent de votre caisse.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => addExpense({ label, category, method, amount: amount ?? 0 }), { success: "Dépense enregistrée.", onSuccess: onDone }); }}>
          <Field label="Libellé"><Input autoFocus required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Lessive, transport, carburant" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Catégorie"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Montant"><AmountInput value={amount} onChange={setAmount} /></Field>
          </div>
          <Field label="Payé en"><MethodPicker value={method} onChange={setMethod} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={!amount || label.trim().length < 2}><ReceiptText />Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ rows, onClose, onDone }: { rows: CashSummaryRow[]; onClose: () => void; onDone: (id: string) => void }) {
  const [counted, setCounted] = useState<Record<Method, number | null>>({ ESPECES: null, MTN_MOMO: null, ORANGE_MONEY: null });
  const [comment, setComment] = useState("");
  const { exec, pending } = useAction();
  const allFilled = METHODS.every((m) => counted[m] !== null);
  const diffs = METHODS.map((m) => ({ m, expected: rows.find((r) => r.method === m)!.expected, diff: counted[m] === null ? null : counted[m]! - rows.find((r) => r.method === m)!.expected }));
  const hasGap = diffs.some((d) => d.diff !== null && d.diff !== 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title="Clôturer la caisse" description="Comptez l'argent pour chaque mode ; l'écart se calcule en direct.">
        <form className="space-y-5" onSubmit={(e) => {
          e.preventDefault();
          exec(() => closeCashSession({ counts: { ESPECES: counted.ESPECES ?? 0, MTN_MOMO: counted.MTN_MOMO ?? 0, ORANGE_MONEY: counted.ORANGE_MONEY ?? 0 }, comment }),
            { success: "Caisse clôturée.", onSuccess: (d) => onDone(d.sessionId) });
        }}>
          <div className="divide-y divide-line rounded-lg border border-line">
            {diffs.map(({ m, expected, diff }) => (
              <div key={m} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-[140px_1fr_200px_120px]">
                <span className="font-medium">{METHOD_LABEL[m]}</span>
                <span className="text-sm text-ink-3">Attendu <Money value={expected} strong className="text-ink" /></span>
                <AmountInput value={counted[m]} onChange={(v) => setCounted({ ...counted, [m]: v })} placeholder="Compté" aria-label={`Compté ${METHOD_LABEL[m]}`} />
                <span className={cn("text-right text-sm font-semibold tnum", diff === null ? "text-ink-3" : diff === 0 ? "text-success" : "text-danger")}>
                  {diff === null ? "—" : diff === 0 ? "OK" : <>{diff > 0 ? "+" : ""}<Money value={diff} unit={false} /></>}
                </span>
              </div>
            ))}
          </div>
          <Field label={hasGap ? "Commentaire (obligatoire : écart constaté)" : "Commentaire (facultatif)"}>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} aria-invalid={hasGap && comment.trim().length < 3} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={!allFilled || (hasGap && comment.trim().length < 3)}><Lock />Confirmer la clôture</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
