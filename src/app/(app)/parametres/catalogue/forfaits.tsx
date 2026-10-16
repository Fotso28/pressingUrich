"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Scale, ChevronRight } from "lucide-react";
import { deleteForfait, saveForfait, setKiloPrice } from "@/server/actions/forfaits";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input } from "@/components/ui/field";
import { Money } from "@/components/money";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";
import { formatKg, parseKg } from "@/lib/domain/kilo";
import { cn } from "@/lib/cn";
import type { Forfait } from "@/server/queries/forfaits";

/** Forfaits au kilo (ex. 20 000 FCFA = 23 kg) et prix du kilo hors forfait. */
export function ForfaitsEditor({ forfaits, kiloPrice }: { forfaits: Forfait[]; kiloPrice: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Forfait | "new" | null>(null);
  const [kp, setKp] = useState<number | null>(kiloPrice || null);
  const { exec, pending } = useAction();
  return (
    <Card>
      <CardHeader title="Linge au kilo et forfaits" description="Le client achète un forfait (un poids de linge) ; chaque dépôt au kilo est déduit de son solde."
        action={<Button size="sm" onClick={() => setEdit("new")}><Plus />Forfait</Button>} />
      <ul className="divide-y divide-line border-t border-line">
        {forfaits.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-3">Aucun forfait.</li>}
        {forfaits.map((f) => (
          <li key={f.id}>
            <button onClick={() => setEdit(f)} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-canvas", !f.active && "opacity-55")}>
              <Scale className="size-4 shrink-0 text-ink-3" />
              <span className={cn("min-w-0 flex-1 font-medium", !f.active && "line-through")}>{f.name}</span>
              <span className="hidden text-sm text-ink-3 tnum sm:inline">{formatKg(f.grams)}</span>
              <Money value={f.price} strong />
              <ChevronRight className="size-4 shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4" onSubmit={(e) => { e.preventDefault(); exec(() => setKiloPrice({ kiloPrice: kp ?? 0 }), { success: "Prix du kilo enregistré.", onSuccess: () => router.refresh() }); }}>
        <Field label="Prix du kilo hors forfait" className="min-w-0 flex-1" hint="Vide : le linge au kilo n'est possible qu'avec un forfait.">
          <AmountInput value={kp} onChange={setKp} placeholder="0" suffix="FCFA/kg" />
        </Field>
        <SaveButton type="submit" variant="secondary" loading={pending} disabled={(kp ?? 0) === kiloPrice}>Enregistrer</SaveButton>
      </form>
      {edit && <ForfaitDialog forfait={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); router.refresh(); }} />}
    </Card>
  );
}

function ForfaitDialog({ forfait, onClose, onDone }: { forfait: Forfait | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(forfait?.name ?? "");
  const [price, setPrice] = useState<number | null>(forfait?.price ?? null);
  const [kg, setKg] = useState(forfait ? String(forfait.grams / 1000).replace(".", ",") : "");
  const [active, setActive] = useState(forfait?.active ?? true);
  const [armed, setArmed] = useState(false);
  const grams = parseKg(kg);
  const { exec, pending } = useAction();
  const ok = name.trim().length >= 2 && !!price && price % 100 === 0 && !!grams && grams >= 1000;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={forfait ? "Modifier le forfait" : "Nouveau forfait"} description="Les forfaits déjà vendus gardent leur prix et leur poids.">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          exec(() => saveForfait({ id: forfait?.id, name, price: price!, grams: grams!, active }), { success: "Forfait enregistré.", onSuccess: onDone });
        }}>
          <Field label="Nom"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Forfait 23 kg" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix"><AmountInput value={price} onChange={setPrice} placeholder="20 000" /></Field>
            <Field label="Poids (kg)"><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="23" className="tnum text-right" /></Field>
          </div>
          {price && grams ? <p className="text-sm text-ink-3">Soit <Money value={Math.round(price / (grams / 1000))} unit={false} /> FCFA le kilo.</p> : null}
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#2F4797]" />Proposé au dépôt</label>
          <DialogFooter>
            {forfait && (
              <Button type="button" variant="ghost" disabled={pending} className={cn("mr-auto text-danger hover:bg-danger-50", armed && "bg-danger-50")}
                onClick={() => (armed ? exec(() => deleteForfait({ id: forfait.id }), { success: "Forfait supprimé.", onSuccess: onDone }) : setArmed(true))}>
                {armed ? "Confirmer la suppression" : "Supprimer"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={!ok}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
