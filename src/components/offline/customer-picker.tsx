"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { PickedCustomer } from "@/components/customers/customer-picker";
import { formatPhone, isValidPhone, normalizeName, normalizePhone } from "@/lib/domain/normalize";
import type { OfflineCustomer } from "@/lib/offline/types";

/** Recherche dans la copie locale des clients ; création possible sans réseau. */
export function OfflineCustomerPicker({ customers, value, onChange, onCreate }: {
  customers: OfflineCustomer[]; value: PickedCustomer | null; onChange: (c: PickedCustomer | null) => void;
  onCreate: (c: { fullName: string; phone: string }) => Promise<PickedCustomer>;
}) {
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const hits = useMemo(() => {
    const t = q.trim();
    if (t.length < 2) return [];
    const digits = t.replace(/\D/g, "");
    const name = normalizeName(t);
    return customers.filter((c) => (digits.length >= 3 && c.phoneNormalized.includes(normalizePhone(digits))) || (name && normalizeName(c.fullName).includes(name))).slice(0, 12);
  }, [q, customers]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-100 bg-brand-50/50 px-4 py-3">
        <div className="min-w-0"><p className="truncate font-semibold">{value.fullName}</p><p className="text-sm text-ink-3 tnum">{formatPhone(value.phone)}</p></div>
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}><X />Changer</Button>
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Téléphone ou nom du client" className="h-12 pl-9" aria-label="Rechercher un client" />
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {hits.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onChange({ id: c.id, fullName: c.fullName, phone: c.phone })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas">
                <span className="truncate font-medium">{c.fullName}</span><span className="shrink-0 text-sm text-ink-3 tnum">{formatPhone(c.phone)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucun client trouvé dans la copie locale.</p>}
      <Button type="button" variant="soft" className="mt-3" onClick={() => setCreating(true)}><UserPlus />Nouveau client</Button>
      {creating && <CreateDialog initial={q} onClose={() => setCreating(false)} onSave={async (c) => { const picked = await onCreate(c); setCreating(false); onChange(picked); }} />}
    </div>
  );
}

function CreateDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (c: { fullName: string; phone: string }) => Promise<void> }) {
  const digits = initial.replace(/\D/g, "");
  const [fullName, setFullName] = useState(digits.length >= 6 ? "" : initial);
  const [phone, setPhone] = useState(digits.length >= 6 ? digits : "");
  const valid = fullName.trim().length >= 2 && isValidPhone(phone);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nouveau client" description="Enregistré sur cet appareil, envoyé au serveur au retour du réseau.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void onSave({ fullName: fullName.trim(), phone: phone.trim() }); }}>
          <Field label="Nom complet"><Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ex. Ngo Bassong Marie" /></Field>
          <Field label="Téléphone" error={phone && !isValidPhone(phone) ? "9 chiffres attendus." : undefined}>
            <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="6 99 65 88 38" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid}>Créer le client</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
