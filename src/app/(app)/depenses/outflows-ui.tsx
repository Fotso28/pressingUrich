"use client";

import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wallet, X, Pencil, Trash2, UserPlus, ShoppingBasket, Users, Home, Zap, Droplets, Tv, Truck, Wrench, Landmark, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { addOutflow, setMonthlySalary, updateOutflow, voidOutflow } from "@/server/actions/outflows";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { Money } from "@/components/money";
import { ReasonDialog } from "../commandes/[id]/order-actions";
import { ALL_OUTFLOW_CATEGORIES, OUTFLOW_CATEGORIES, OUTFLOW_CATEGORY_LABEL, OUTFLOW_METHODS, OUTFLOW_METHOD_LABEL, type OutflowCategory, type OutflowMethod } from "@/lib/domain/cash";
import { formatDate, formatDateTime, fromDateTimeLocal, toDateTimeLocal } from "@/lib/domain/dates";
import { formatAmount } from "@/lib/domain/money";
import { useAction } from "@/lib/use-action";
import type { SalaryStaff } from "@/server/queries/finance";
import { cn } from "@/lib/cn";

export const CATEGORY_ICON: Record<OutflowCategory, React.ComponentType<{ className?: string }>> = {
  INTRANTS: ShoppingBasket, SALAIRES: Users, LOYER: Home, ELECTRICITE: Zap, EAU: Droplets, ABONNEMENTS: Tv, ENERGIE_EAU: Zap, TRANSPORT: Truck, ENTRETIEN: Wrench, TAXES: Landmark, AUTRE: MoreHorizontal,
};

const PRESETS: Partial<Record<OutflowCategory, string[]>> = {
  INTRANTS: ["Lessive (carton)", "Eau de Javel (bidon 20 L)", "Détachant", "Amidon", "Cintres", "Housses et sachets", "Assouplissant"],
  LOYER: ["Loyer du local"],
  ELECTRICITE: ["Facture ENEO (électricité)", "Carburant groupe électrogène"],
  EAU: ["Facture CAMWATER (eau)"],
  ABONNEMENTS: ["Abonnement TV Canal+", "Forfait internet"],
  AUTRE: ["Fournitures de bureau", "Gaz", "Divers"],
  ENTRETIEN: ["Réparation machine à laver", "Réparation fer à repasser", "Entretien séchoir"],
  TAXES: ["Impôt libératoire", "Taxe communale", "Patente"],
  TRANSPORT: ["Transport livraison", "Achat au marché (transport)"],
};

export function OutflowActions({ staff, defaultPeriod }: { staff: SalaryStaff[]; defaultPeriod: string }) {
  const [open, setOpen] = useState<null | "salary" | "out">(null);
  const router = useRouter();
  return (
    <>
      <SaveButton variant="secondary" onClick={() => setOpen("salary")}><Users />Payer un salaire</SaveButton>
      <SaveButton onClick={() => setOpen("out")}><Plus />Nouvelle sortie</SaveButton>
      {open && <OutflowDialog salary={open === "salary"} staff={staff} defaultPeriod={defaultPeriod} onClose={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />}
    </>
  );
}

const ROLE_LABEL: Record<string, string> = { ADMIN: "Gérant", AGENT: "Agent comptoir" };

/** Une sortie existante, ouverte pour modification. */
export type EditableOutflow = {
  id: string; at: string; category: OutflowCategory; label: string; amount: number; method: string;
  beneficiary: string | null; beneficiaryUserId: string | null; salaryPeriod: string | null; notes: string | null;
};

/**
 * Salaires : chaque employé (compte utilisateur) avec son salaire de base (créer, modifier, supprimer)
 * et ses paiements du mois (payer, modifier, supprimer).
 */
export function SalaryBoard({ staff, paid, period, periodLabel }: {
  staff: SalaryStaff[]; period: string; periodLabel: string;
  paid: (EditableOutflow & { userId: string | null; name: string })[];
}) {
  const router = useRouter();
  const [payFor, setPayFor] = useState<string | null>(null);
  const [salaryFor, setSalaryFor] = useState<SalaryStaff | null>(null);
  const [editing, setEditing] = useState<EditableOutflow | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const { exec } = useAction();
  // Employés : les agents, les comptes ayant un salaire de base, et ceux payés ce mois-ci.
  const rows = staff.filter((u) => u.role === "AGENT" || u.monthlySalary != null || paid.some((p) => p.userId === u.id));
  const orphans = paid.filter((p) => !p.userId || !staff.some((u) => u.id === p.userId));
  const payroll = rows.reduce((a, u) => a + (u.monthlySalary ?? 0), 0);
  const paidTotal = paid.reduce((a, p) => a + p.amount, 0);
  const done = () => { setPayFor(null); setEditing(null); setVoidId(null); setSalaryFor(null); router.refresh(); };
  const PaidLine = ({ p }: { p: EditableOutflow & { name: string } }) => (
    <div className="flex items-center gap-1 text-[13px] text-ink-2">
      <span className="tnum">Payé le {formatDate(p.at)} · {OUTFLOW_METHOD_LABEL[p.method as OutflowMethod] ?? p.method}</span>
      <Money value={p.amount} strong className="ml-auto" />
      <button onClick={() => setEditing(p)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink" aria-label={`Modifier le paiement de ${p.name}`}><Pencil className="size-3.5" /></button>
      <button onClick={() => setVoidId(p.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label={`Supprimer le paiement de ${p.name}`}><Trash2 className="size-3.5" /></button>
    </div>
  );
  return (
    <Card>
      <CardHeader title="Salaires du mois" description={`${periodLabel} · masse salariale ${formatAmount(payroll)} FCFA · versé ${formatAmount(paidTotal)} FCFA`}
        action={<Link href="/parametres/utilisateurs" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"><UserPlus className="size-4" />Employé</Link>} />
      {rows.length + orphans.length === 0 ? <EmptyState title="Aucun employé">Créez les comptes des employés dans Paramètres › Utilisateurs.</EmptyState> : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((u) => {
            const mine = paid.filter((p) => p.userId === u.id);
            return (
              <li key={u.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="min-w-[12rem] flex-1">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="text-[13px] text-ink-3 tnum">
                      {ROLE_LABEL[u.role] ?? u.role} · {u.monthlySalary != null ? <>salaire de base <span className="font-medium text-ink-2">{formatAmount(u.monthlySalary)} FCFA</span></> : "salaire non défini"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 max-sm:ml-auto">
                    <Button size="sm" variant="ghost" onClick={() => setSalaryFor(u)} aria-label={`Salaire de base de ${u.name}`}><Pencil />Salaire</Button>
                    {!mine.length && <Button size="sm" variant="secondary" onClick={() => setPayFor(u.id)}><Wallet />Payer</Button>}
                  </div>
                </div>
                {mine.length > 0 && <div className="mt-1.5 space-y-0.5 rounded-md bg-canvas px-3 py-1">{mine.map((p) => <PaidLine key={p.id} p={p} />)}</div>}
              </li>
            );
          })}
          {orphans.map((p) => (
            <li key={p.id} className="px-5 py-3"><p className="font-medium">{p.name}</p><PaidLine p={p} /></li>
          ))}
        </ul>
      )}
      {payFor && <OutflowDialog salary staff={staff} defaultPeriod={period} defaultUserId={payFor} onClose={() => setPayFor(null)} onDone={done} />}
      {editing && <OutflowDialog salary staff={staff} defaultPeriod={period} edit={editing} onClose={() => setEditing(null)} onDone={done} />}
      {salaryFor && <BaseSalaryDialog employee={salaryFor} onClose={() => setSalaryFor(null)} onDone={done} />}
      <ReasonDialog open={!!voidId} onOpenChange={(o) => !o && setVoidId(null)} title="Supprimer le paiement de salaire" danger confirm="Supprimer"
        description="Le paiement reste visible dans l'historique, marqué annulé, et ne compte plus dans les dépenses."
        onConfirm={(reason) => exec(() => voidOutflow({ id: voidId!, reason }), { success: "Paiement supprimé.", onSuccess: done })} />
    </Card>
  );
}

function BaseSalaryDialog({ employee, onClose, onDone }: { employee: SalaryStaff; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState<number | null>(employee.monthlySalary ?? employee.lastAmount ?? null);
  const { exec, pending } = useAction();
  const invalid = !amount || amount % 100 !== 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`Salaire de ${employee.name}`} description="Salaire mensuel de base, prérempli à chaque paiement (modifiable au moment de payer : prime, avance, retenue).">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => setMonthlySalary({ userId: employee.id, amount }), { success: "Salaire de base enregistré.", onSuccess: onDone }); }}>
          <Field label="Salaire mensuel" error={amount && amount % 100 !== 0 ? "Multiple de 100 FCFA." : undefined}>
            <AmountInput autoFocus value={amount} onChange={setAmount} className="h-12 text-lg" />
          </Field>
          <DialogFooter>
            {employee.monthlySalary != null && (
              <Button type="button" variant="ghost" className="mr-auto text-danger hover:bg-danger-50" disabled={pending}
                onClick={() => exec(() => setMonthlySalary({ userId: employee.id, amount: null }), { success: "Salaire de base supprimé.", onSuccess: onDone })}>
                <Trash2 />Supprimer
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={invalid}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Montant proposé pour payer un employé : son salaire de base, sinon son dernier salaire. */
const suggestedPay = (u?: SalaryStaff) => u?.monthlySalary ?? u?.lastAmount ?? null;

function OutflowDialog({ salary, staff, defaultPeriod, defaultUserId, edit, onClose, onDone }: {
  salary: boolean; staff: SalaryStaff[]; defaultPeriod: string; defaultUserId?: string; edit?: EditableOutflow; onClose: () => void; onDone: () => void;
}) {
  const initialUser = staff.find((u) => u.id === (edit?.beneficiaryUserId ?? defaultUserId));
  const [category, setCategory] = useState<OutflowCategory>(edit?.category ?? (salary ? "SALAIRES" : "INTRANTS"));
  const [label, setLabel] = useState(edit?.label ?? (salary ? "Salaire" : ""));
  const [amount, setAmount] = useState<number | null>(edit?.amount ?? suggestedPay(initialUser));
  const [method, setMethod] = useState<OutflowMethod>((edit?.method as OutflowMethod) ?? (salary ? "MTN_MOMO" : "ESPECES"));
  const [beneficiary, setBeneficiary] = useState(edit?.category !== "SALAIRES" ? edit?.beneficiary ?? "" : "");
  const [employeeId, setEmployeeId] = useState(initialUser?.id ?? "");
  const [period, setPeriod] = useState(edit?.salaryPeriod ?? defaultPeriod);
  const [when, setWhen] = useState(() => toDateTimeLocal(edit ? new Date(edit.at) : new Date()));
  const [notes, setNotes] = useState(edit?.notes ?? "");
  const { exec, pending } = useAction();
  const isSalary = category === "SALAIRES";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={edit ? (isSalary ? "Modifier le paiement de salaire" : "Modifier la sortie") : isSalary ? "Payer un salaire" : "Nouvelle sortie d'argent"} description={isSalary ? "Le paiement est enregistré dans les dépenses du mois." : "Achat d'intrants, loyer, facture, réparation…"}>
        <form className="space-y-5" onSubmit={(e) => {
          e.preventDefault();
          const date = fromDateTimeLocal(when);
          if (Number.isNaN(date.getTime())) { toast.error("Date invalide."); return; }
          const input = {
            occurredAt: date.toISOString(), category, label: isSalary ? "Salaire" : label,
            amount: amount ?? 0, method, beneficiary: isSalary ? undefined : beneficiary, beneficiaryUserId: isSalary ? employeeId : null,
            salaryPeriod: isSalary ? period : null, notes,
          };
          exec(() => (edit ? updateOutflow({ ...input, id: edit.id }) : addOutflow(input)),
            { success: edit ? "Modification enregistrée." : isSalary ? "Salaire enregistré." : "Sortie enregistrée.", onSuccess: onDone });
        }}>
          {!salary && !(edit && edit.category === "SALAIRES") && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {OUTFLOW_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c];
                return (
                  <button key={c} type="button" onClick={() => { setCategory(c); setLabel(""); }}
                    className={cn("flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-center text-[13px] font-medium leading-tight transition",
                      category === c ? "border-brand bg-brand-50 text-brand ring-3 ring-brand/10" : "border-line-2 text-ink-2 hover:bg-subtle")}>
                    <Icon className="size-[18px]" />{OUTFLOW_CATEGORY_LABEL[c]}
                  </button>
                );
              })}
            </div>
          )}
          {isSalary ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Employé" htmlFor="salary-employee" hint="Comptes actifs de Paramètres › Utilisateurs">
                <select id="salary-employee" autoFocus required value={employeeId} onChange={(e) => {
                  const u = staff.find((x) => x.id === e.target.value);
                  setEmployeeId(e.target.value);
                  if (!edit) setAmount(suggestedPay(u));
                }} className="h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand focus:ring-3 focus:ring-brand/12">
                  <option value="" disabled>Choisir un employé…</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>{u.name} — {ROLE_LABEL[u.role] ?? u.role}</option>)}
                </select>
              </Field>
              <Field label="Mois de salaire"><Input type="month" required value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Libellé">
                <Input autoFocus required list="presets" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. Lessive (carton)" />
                <datalist id="presets">{(PRESETS[category] ?? []).map((s) => <option key={s} value={s} />)}</datalist>
              </Field>
              <Field label="Fournisseur / bénéficiaire (facultatif)"><Input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="ex. Quincaillerie Ndokoti" /></Field>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Montant"><AmountInput value={amount} onChange={setAmount} className="h-12 text-lg" /></Field>
            <Field label="Date"><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-12" /></Field>
          </div>
          <Field label="Payé par">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {OUTFLOW_METHODS.map((m) => (
                <button key={m} type="button" onClick={() => setMethod(m)}
                  className={cn("h-11 rounded-md border text-sm font-medium", method === m ? "border-brand bg-brand-50 text-brand" : "border-line-2 text-ink-2 hover:bg-subtle")}>{OUTFLOW_METHOD_LABEL[m]}</button>
              ))}
            </div>
          </Field>
          <Field label="Notes (facultatif)"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={!amount || (isSalary ? !employeeId : label.trim().length < 2)}>
              <Wallet />Enregistrer <Money value={amount ?? 0} unit={false} />
            </SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Row = EditableOutflow & { source: "SORTIE" | "CAISSE"; by: string | null; voided: boolean; voidReason: string | null };

export function MoneyOutTable({ rows, staff, period }: { rows: Row[]; staff: SalaryStaff[]; period: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Row | null>(null);
  const [filter, setFilter] = useState<OutflowCategory | "ALL">("ALL");
  const [voidId, setVoidId] = useState<string | null>(null);
  const { exec } = useAction();
  const present = ALL_OUTFLOW_CATEGORIES.filter((c) => rows.some((r) => r.category === c));
  const shown = rows.filter((r) => filter === "ALL" || r.category === filter);
  return (
    <Card>
      <CardHeader title="Toutes les sorties" description="Sorties du gérant et dépenses saisies aux caisses" />
      <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">
        {(["ALL", ...present] as const).map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={cn("h-8 rounded-full border px-3 text-[13px] font-medium",
            filter === c ? "border-brand bg-brand-50 text-brand" : "border-line-2 text-ink-2 hover:bg-subtle")}>
            {c === "ALL" ? "Tout" : OUTFLOW_CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <EmptyState title="Aucune sortie" /> : (
        <ul className="divide-y divide-line border-t border-line">
          {shown.map((r) => {
            const Icon = CATEGORY_ICON[r.category];
            return (
              <li key={r.source + r.id} className={cn("flex items-center gap-4 px-5 py-3", r.voided && "opacity-55")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fdf0ea] text-[#c4501f]"><Icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate font-medium", r.voided && "line-through")}>{r.label}{r.beneficiary && r.category !== "SALAIRES" && <span className="font-normal text-ink-3"> · {r.beneficiary}</span>}</p>
                  <p className="text-[13px] text-ink-3 tnum">{formatDateTime(r.at)} · {OUTFLOW_CATEGORY_LABEL[r.category]} · {OUTFLOW_METHOD_LABEL[r.method as OutflowMethod] ?? r.method}{r.by && ` · ${r.by}`}</p>
                  {r.voided && r.voidReason && <p className="text-[12.5px] text-danger">Annulée : {r.voidReason}</p>}
                </div>
                <Badge className={r.source === "CAISSE" ? "hidden bg-subtle text-ink-2 ring-line sm:inline-flex" : "hidden bg-brand-50 text-brand ring-brand-100 sm:inline-flex"}>{r.source === "CAISSE" ? "Caisse" : "Sortie"}</Badge>
                <Money value={r.amount} strong className={cn(r.voided && "line-through")} />
                {r.source === "SORTIE" && !r.voided ? (
                  <span className="flex shrink-0">
                    <button onClick={() => setEditing(r)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Modifier la sortie"><Pencil className="size-4" /></button>
                    <button onClick={() => setVoidId(r.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label="Supprimer la sortie"><X className="size-4" /></button>
                  </span>
                ) : <span className="w-16" />}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <OutflowDialog salary={editing.category === "SALAIRES"} staff={staff} defaultPeriod={period} edit={editing}
        onClose={() => setEditing(null)} onDone={() => { setEditing(null); router.refresh(); }} />}
      <ReasonDialog open={!!voidId} onOpenChange={(o) => !o && setVoidId(null)} title="Supprimer la sortie" danger confirm="Supprimer"
        description="La sortie restera visible, marquée annulée, et ne comptera plus dans les dépenses."
        onConfirm={(reason) => exec(() => voidOutflow({ id: voidId!, reason }), { success: "Sortie supprimée.", onSuccess: () => { setVoidId(null); router.refresh(); } })} />
    </Card>
  );
}
