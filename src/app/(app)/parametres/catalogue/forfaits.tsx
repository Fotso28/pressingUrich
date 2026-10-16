"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Scale, ChevronRight } from "lucide-react";
import { deleteForfait, deleteKiloType, saveForfait, saveKiloType } from "@/server/actions/forfaits";
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

type KiloType = { id: string; name: string; pricePerKg: number; sortOrder: number; active: boolean };

/** Linge au kilo (types de linge et prix du kilo) et forfaits (ex. 20 000 FCFA = 23 kg, déduits du linge au kilo). */
export function ForfaitsEditor({ forfaits, kiloTypes }: { forfaits: Forfait[]; kiloTypes: KiloType[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Forfait | "new" | null>(null);
  const [editKilo, setEditKilo] = useState<KiloType | "new" | null>(null);
  return (
    <>
    <Card>
      <CardHeader title="Linge au kilo" description="Au dépôt : on choisit le type de linge, on pèse, le prix suit le prix du kilo."
        action={<Button size="sm" onClick={() => setEditKilo("new")}><Plus />Type de linge</Button>} />
      <ul className="divide-y divide-line border-t border-line">
        {kiloTypes.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-3">Aucun type de linge au kilo.</li>}
        {kiloTypes.map((k) => (
          <li key={k.id}>
            <button onClick={() => setEditKilo(k)} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-canvas", !k.active && "opacity-55")}>
              <Scale className="size-4 shrink-0 text-ink-3" />
              <span className={cn("min-w-0 flex-1 font-medium", !k.active && "line-through")}>{k.name}</span>
              <span className="tnum"><Money value={k.pricePerKg} strong /><span className="text-sm text-ink-3"> /kg</span></span>
              <ChevronRight className="size-4 shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>
      {editKilo && <KiloTypeDialog kilo={editKilo === "new" ? null : editKilo} nextOrder={kiloTypes.length} onClose={() => setEditKilo(null)} onDone={() => { setEditKilo(null); router.refresh(); }} />}
    </Card>
    <Card>
      <CardHeader title="Forfaits" description="Le client achète un poids de linge à l'avance ; ses dépôts au kilo en sont déduits en priorité."
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
      {edit && <ForfaitDialog forfait={edit === "new" ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); router.refresh(); }} />}
    </Card>
    </>
  );
}

function KiloTypeDialog({ kilo, nextOrder, onClose, onDone }: { kilo: KiloType | null; nextOrder: number; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(kilo?.name ?? "");
  const [price, setPrice] = useState<number | null>(kilo?.pricePerKg ?? null);
  const [sortOrder, setSortOrder] = useState(kilo?.sortOrder ?? nextOrder);
  const [active, setActive] = useState(kilo?.active ?? true);
  const [armed, setArmed] = useState(false);
  const { exec, pending } = useAction();
  const ok = name.trim().length >= 2 && !!price && price % 100 === 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={kilo ? "Modifier le type de linge" : "Nouveau type de linge"} description="Les dépôts déjà faits gardent leur prix.">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          exec(() => saveKiloType({ id: kilo?.id, name, pricePerKg: price!, sortOrder, active }), { success: "Type de linge enregistré.", onSuccess: onDone });
        }}>
          <Field label="Nom"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Linge blanc" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prix du kilo" hint={price && price % 100 ? "Multiple de 100 FCFA." : undefined}><AmountInput value={price} onChange={setPrice} placeholder="1 000" suffix="FCFA/kg" /></Field>
            <Field label="Ordre d'affichage"><Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value || "0", 10))} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="size-4 accent-[#2F4797]" />Proposé au dépôt</label>
          <DialogFooter>
            {kilo && (
              <Button type="button" variant="ghost" disabled={pending} className={cn("mr-auto text-danger hover:bg-danger-50", armed && "bg-danger-50")}
                onClick={() => (armed ? exec(() => deleteKiloType({ id: kilo.id }), { success: "Type supprimé.", onSuccess: onDone }) : setArmed(true))}>
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
