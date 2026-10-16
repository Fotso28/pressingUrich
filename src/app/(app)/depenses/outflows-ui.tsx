"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wallet, X, ShoppingBasket, Users, Home, Zap, Droplets, Tv, Truck, Wrench, Landmark, MoreHorizontal } from "lucide-react";
import { addOutflow, voidOutflow } from "@/server/actions/outflows";
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

/** Salaires du mois : chaque employé (compte utilisateur), payé ou à payer. */
export function SalaryBoard({ staff, paid, period, periodLabel }: {
  staff: SalaryStaff[]; period: string; periodLabel: string;
  paid: { id: string; userId: string | null; name: string; amount: number; at: string }[];
}) {
  const router = useRouter();
  const [payFor, setPayFor] = useState<string | null>(null);
  // Les agents apparaissent toujours ; les autres comptes seulement s'ils ont été payés ce mois-ci.
  const rows = staff.filter((u) => u.role === "AGENT" || paid.some((p) => p.userId === u.id));
  const orphans = paid.filter((p) => !p.userId || !staff.some((u) => u.id === p.userId));
  return (
    <Card>
      <CardHeader title="Salaires du mois" description={`Employés et paiements · ${periodLabel}`} />
      {rows.length + orphans.length === 0 ? <EmptyState title="Aucun employé">Créez les comptes des employés dans Paramètres › Utilisateurs.</EmptyState> : (
        <ul className="divide-y divide-line border-t border-line">
          {rows.map((u) => {
            const mine = paid.filter((p) => p.userId === u.id);
            const total = mine.reduce((a, p) => a + p.amount, 0);
            return (
              <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="text-[13px] text-ink-3 tnum">{ROLE_LABEL[u.role] ?? u.role}{mine.length ? ` · payé le ${formatDate(mine[0].at)}` : u.lastAmount ? ` · habituellement ${formatAmount(u.lastAmount)} FCFA` : " · à payer"}</p>
                </div>
                {mine.length ? <Money value={total} strong /> : (
                  <Button size="sm" variant="secondary" onClick={() => setPayFor(u.id)}><Wallet />Payer</Button>
                )}
              </li>
            );
          })}
          {orphans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div><p className="font-medium">{p.name}</p><p className="text-[13px] text-ink-3">Payé le {formatDate(p.at)}</p></div>
              <Money value={p.amount} strong />
            </li>
          ))}
        </ul>
      )}
      {payFor && <OutflowDialog salary staff={staff} defaultPeriod={period} defaultUserId={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); router.refresh(); }} />}
    </Card>
  );
}

function OutflowDialog({ salary, staff, defaultPeriod, defaultUserId, onClose, onDone }: { salary: boolean; staff: SalaryStaff[]; defaultPeriod: string; defaultUserId?: string; onClose: () => void; onDone: () => void }) {
  const initialUser = staff.find((u) => u.id === defaultUserId);
  const [category, setCategory] = useState<OutflowCategory>(salary ? "SALAIRES" : "INTRANTS");
  const [label, setLabel] = useState(salary ? "Salaire" : "");
  const [amount, setAmount] = useState<number | null>(initialUser?.lastAmount ?? null);
  const [method, setMethod] = useState<OutflowMethod>(salary ? "MTN_MOMO" : "ESPECES");
  const [beneficiary, setBeneficiary] = useState("");
  const [employeeId, setEmployeeId] = useState(initialUser?.id ?? "");
  const [period, setPeriod] = useState(defaultPeriod);
  const [when, setWhen] = useState(() => toDateTimeLocal(new Date()));
  const [notes, setNotes] = useState("");
  const { exec, pending } = useAction();
  const isSalary = category === "SALAIRES";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide title={isSalary ? "Payer un salaire" : "Nouvelle sortie d'argent"} description={isSalary ? "Le paiement est enregistré dans les dépenses du mois." : "Achat d'intrants, loyer, facture, réparation…"}>
        <form className="space-y-5" onSubmit={(e) => {
          e.preventDefault();
          exec(() => addOutflow({
            occurredAt: fromDateTimeLocal(when).toISOString(), category, label: isSalary ? "Salaire" : label,
            amount: amount ?? 0, method, beneficiary: isSalary ? undefined : beneficiary, beneficiaryUserId: isSalary ? employeeId : null,
            salaryPeriod: isSalary ? period : null, notes,
          }), { success: isSalary ? "Salaire enregistré." : "Sortie enregistrée.", onSuccess: onDone });
        }}>
          {!salary && (
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
                  if (u?.lastAmount && !amount) setAmount(u.lastAmount);
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

type Row = {
  id: string; source: "SORTIE" | "CAISSE"; at: string; category: OutflowCategory; label: string; amount: number; method: string;
  beneficiary: string | null; salaryPeriod: string | null; by: string | null; voided: boolean; voidReason: string | null;
};

export function MoneyOutTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
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
                {r.source === "SORTIE" && !r.voided
                  ? <button onClick={() => setVoidId(r.id)} className="grid size-8 place-items-center rounded text-ink-3 hover:bg-danger-50 hover:text-danger" aria-label="Annuler la sortie"><X className="size-4" /></button>
                  : <span className="w-8" />}
              </li>
            );
          })}
        </ul>
      )}
      <ReasonDialog open={!!voidId} onOpenChange={(o) => !o && setVoidId(null)} title="Annuler la sortie" danger confirm="Annuler la sortie"
        description="La sortie restera visible, marquée annulée, et ne comptera plus dans les dépenses."
        onConfirm={(reason) => exec(() => voidOutflow({ id: voidId!, reason }), { success: "Sortie annulée.", onSuccess: () => { setVoidId(null); router.refresh(); } })} />
    </Card>
  );
}
