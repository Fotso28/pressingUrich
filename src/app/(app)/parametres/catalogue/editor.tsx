"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Star } from "lucide-react";
import { setPrice, upsertItemType, upsertService } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

type Item = { id: string; name: string; isFrequent: boolean; sortOrder: number; active: boolean };
type Service = { id: string; name: string; shortName: string; active: boolean };
type Price = { itemTypeId: string; serviceId: string; amount: number; active: boolean };

export function CatalogEditor({ items, services, prices }: { items: Item[]; services: Service[]; prices: Price[] }) {
  const router = useRouter();
  const [editItem, setEditItem] = useState<Item | "new" | null>(null);
  const [editService, setEditService] = useState<Service | "new" | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const visibleItems = items.filter((i) => showInactive || i.active);
  const visibleServices = services.filter((s) => showInactive || s.active);
  const refresh = () => router.refresh();

  return (
    <>
      <Card>
        <CardHeader title="Grille de prix" description="Articles en lignes, services en colonnes. Cellule vide = combinaison non proposée au dépôt."
          action={<div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-[#2F4797]" />Inactifs</label>
            <Button size="sm" variant="secondary" onClick={() => setEditService("new")}><Plus />Service</Button>
            <Button size="sm" onClick={() => setEditItem("new")}><Plus />Article</Button>
          </div>} />
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[640px] text-[14.5px]">
            <thead>
              <tr className="border-b border-line bg-canvas/70">
                <th className="sticky left-0 z-[1] bg-canvas px-5 py-3 text-left text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3">Article</th>
                {visibleServices.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-right">
                    <button onClick={() => setEditService(s)} className={cn("group inline-flex items-center gap-1.5 text-[13px] font-semibold", !s.active && "text-ink-3 line-through")}>
                      {s.name}<Pencil className="size-3 text-ink-3 opacity-0 group-hover:opacity-100" />
                    </button>
                    <div className="text-[11.5px] font-normal text-ink-3">{s.shortName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleItems.map((i) => (
                <tr key={i.id} className={cn(!i.active && "opacity-55")}>
                  <td className="sticky left-0 z-[1] bg-surface px-5 py-2">
                    <button onClick={() => setEditItem(i)} className={cn("group flex items-center gap-2 font-medium", !i.active && "line-through")}>
                      {i.isFrequent && <Star className="size-3.5 fill-warning text-warning" aria-label="Fréquent" />}{i.name}
                      <Pencil className="size-3 text-ink-3 opacity-0 group-hover:opacity-100" />
                    </button>
                  </td>
                  {visibleServices.map((s) => {
                    const p = prices.find((x) => x.itemTypeId === i.id && x.serviceId === s.id);
                    return <td key={s.id} className="px-2 py-1.5 text-right"><PriceCell itemTypeId={i.id} serviceId={s.id} initial={p?.active ? p.amount : null} onSaved={refresh} /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">Les prix sont enregistrés à la sortie du champ. Un changement de tarif n&apos;affecte pas les commandes existantes.</p>
      </Card>

      {editItem && <ItemDialog item={editItem === "new" ? null : editItem} nextOrder={items.length} onClose={() => setEditItem(null)} onDone={() => { setEditItem(null); refresh(); }} />}
      {editService && <ServiceDialog service={editService === "new" ? null : editService} onClose={() => setEditService(null)} onDone={() => { setEditService(null); refresh(); }} />}
    </>
  );
}

function PriceCell({ itemTypeId, serviceId, initial, onSaved }: { itemTypeId: string; serviceId: string; initial: number | null; onSaved: () => void }) {
  const [v, setV] = useState(initial === null ? "" : String(initial));
  const [saved, setSaved] = useState(initial === null ? "" : String(initial));
  const { exec, pending } = useAction();
  async function commit() {
    const clean = v.replace(/\D/g, "");
    if (clean === saved) return;
    const amount = clean === "" ? null : parseInt(clean, 10);
    const r = await exec(() => setPrice({ itemTypeId, serviceId, amount }));
    if (r.ok) { setSaved(clean); setV(clean); onSaved(); } else setV(saved);
  }
  const display = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (
    <input inputMode="numeric" value={display(v)} placeholder="—" aria-label="Prix"
      onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 8))} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(saved); } }}
      className={cn("h-10 w-28 rounded-md border border-transparent bg-transparent px-2 text-right tnum outline-none transition hover:border-line-2 focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand/12 placeholder:text-ink-3/50",
        pending && "opacity-50", v !== saved && "border-warning")} />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (b: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between rounded-md border border-line-2 px-3 py-2.5 text-sm font-medium" aria-pressed={checked}>
      {label}
      <span className={cn("h-5 w-9 rounded-full p-0.5 transition", checked ? "bg-brand" : "bg-line-2")}><span className={cn("block size-4 rounded-full bg-white transition", checked && "translate-x-4")} /></span>
    </button>
  );
}

function ItemDialog({ item, nextOrder, onClose, onDone }: { item: Item | null; nextOrder: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Omit<Item, "id">>(item ?? { name: "", isFrequent: true, sortOrder: nextOrder, active: true });
  const { exec, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item ? "Modifier l'article" : "Nouvel article"}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => upsertItemType({ ...f, id: item?.id }), { success: "Article enregistré.", onSuccess: onDone }); }}>
          <Field label="Nom"><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Chemise" /></Field>
          <Field label="Ordre d'affichage"><Input type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: parseInt(e.target.value || "0", 10) })} /></Field>
          <Toggle checked={f.isFrequent} onChange={(b) => setF({ ...f, isFrequent: b })} label="Bouton rapide au dépôt (article fréquent)" />
          <Toggle checked={f.active} onChange={(b) => setF({ ...f, active: b })} label="Actif" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ServiceDialog({ service, onClose, onDone }: { service: Service | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Omit<Service, "id">>(service ?? { name: "", shortName: "", active: true });
  const { exec, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={service ? "Modifier le service" : "Nouveau service"}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => upsertService({ ...f, id: service?.id }), { success: "Service enregistré.", onSuccess: onDone }); }}>
          <Field label="Nom"><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Lavage + repassage" /></Field>
          <Field label="Nom court (ticket)" hint="12 caractères max."><Input required maxLength={12} value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} placeholder="ex. Lav+Rep" /></Field>
          <Toggle checked={f.active} onChange={(b) => setF({ ...f, active: b })} label="Actif" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
