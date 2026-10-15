"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, X, Phone, AlertTriangle } from "lucide-react";
import { createCustomer, searchCustomersAction } from "@/server/actions/customers";
import type { CustomerHit } from "@/server/queries/search";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { Money } from "@/components/money";
import { formatPhone } from "@/lib/domain/normalize";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

export type PickedCustomer = { id: string; fullName: string; phone: string };

export function CustomerPicker({ value, onChange }: { value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchCustomersAction(term);
        if (my === seq.current && r.ok) { setHits(r.data); setSearched(true); }
      } finally { if (my === seq.current) setLoading(false); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3 pl-4">
        <span className="grid size-10 place-items-center rounded-full bg-brand text-[15px] font-semibold text-white">{value.fullName.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{value.fullName}</p>
          <p className="text-sm text-ink-2 tnum">{formatPhone(value.phone)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}><X />Changer</Button>
      </div>
    );
  }

  const isDigits = /^[\d\s+\-.]+$/.test(q.trim());
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 3) { setHits([]); setSearched(false); } }} placeholder="Téléphone ou nom du client" className="h-12 pl-11 text-base" aria-label="Rechercher un client" />
        {loading && <span className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 rounded-full border-2 border-brand border-r-transparent animate-spin" />}
      </div>
      {q.trim().length > 0 && q.trim().length < 3 && <p className="mt-2 text-[13px] text-ink-3">Saisissez au moins 3 caractères.</p>}
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => onChange({ id: h.id, fullName: h.fullName, phone: h.phone })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-canvas">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.fullName}</p>
                  <p className="text-[13px] text-ink-3 tnum">{formatPhone(h.phone)}</p>
                </div>
                <span className={cn("text-[13px] tnum", h.openOrders ? "text-brand font-medium" : "text-ink-3")}>{h.openOrders} en cours</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched && !loading && hits.length === 0 && <p className="mt-3 text-sm text-ink-3">Aucun client trouvé.</p>}
      <Button type="button" variant="soft" className="mt-3" onClick={() => setCreateOpen(true)}>
        <UserPlus />{searched && q.trim() ? `Créer « ${q.trim()} »` : "Nouveau client"}
      </Button>
      <CreateCustomerDialog open={createOpen} onOpenChange={setCreateOpen}
        initial={isDigits ? { fullName: "", phone: q.trim() } : { fullName: q.trim(), phone: "" }}
        onPicked={(c) => { setCreateOpen(false); onChange(c); }} />
    </div>
  );
}

export function CreateCustomerDialog({ open, onOpenChange, initial, onPicked }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: { fullName: string; phone: string }; onPicked: (c: PickedCustomer) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Nouveau client" description="Nom et téléphone obligatoires.">
        <CreateCustomerForm initial={initial} onPicked={onPicked} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Monté à chaque ouverture : l'état repart des valeurs initiales. */
function CreateCustomerForm({ initial, onPicked, onCancel }: { initial: { fullName: string; phone: string }; onPicked: (c: PickedCustomer) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ fullName: initial.fullName, phone: initial.phone, address: "", notes: "" });
  const [dups, setDups] = useState<CustomerHit[]>([]);
  const { exec, pending } = useAction();

  async function save(force: boolean) {
    await exec(() => createCustomer({ ...form, force }), {
      onSuccess: (d) => {
        if (d.created) onPicked(d.created);
        else setDups(d.duplicates);
      },
    });
  }

  return (
        <form onSubmit={(e) => { e.preventDefault(); save(false); }} className="space-y-4">
          <Field label="Nom complet" htmlFor="c-name">
            <Input id="c-name" autoFocus={!initial.fullName} required value={form.fullName} onChange={(e) => { setForm({ ...form, fullName: e.target.value }); }} placeholder="ex. Ngono Marie" />
          </Field>
          <Field label="Téléphone" htmlFor="c-phone" hint="9 chiffres ; +237 accepté.">
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
              <Input id="c-phone" inputMode="tel" required value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDups([]); }} className="pl-9 tnum" placeholder="6 99 12 34 56" autoFocus={!!initial.fullName} />
            </div>
          </Field>
          <Field label="Adresse (facultatif)" htmlFor="c-addr"><Input id="c-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <Field label="Notes (facultatif)" htmlFor="c-notes"><Textarea id="c-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>

          {dups.length > 0 && (
            <div className="rounded-lg border border-[#fde3b8] bg-warning-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#8a5300]"><AlertTriangle className="size-4" />Ce numéro est déjà utilisé</p>
              <ul className="mt-3 space-y-2">
                {dups.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 ring-1 ring-[#fde3b8]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.fullName}</p>
                      <p className="text-[12.5px] text-ink-3">{d.openOrders} en cours{d.due > 0 && <> · dû <Money value={d.due} /></>}</p>
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onPicked({ id: d.id, fullName: d.fullName, phone: d.phone })}>Utiliser ce client</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
            {dups.length > 0
              ? <SaveButton type="button" variant="secondary" loading={pending} onClick={() => save(true)}>Créer quand même</SaveButton>
              : <SaveButton type="submit" loading={pending}>Créer le client</SaveButton>}
          </DialogFooter>
        </form>
  );
}
