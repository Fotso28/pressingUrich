"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Star, Trash2, ChevronRight } from "lucide-react";
import { deleteItemType, deleteService, saveItem, setPrice, upsertService } from "@/server/actions/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { AmountInput, Field, Input } from "@/components/ui/field";
import { Money } from "@/components/money";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/cn";

type Item = { id: string; name: string; isFrequent: boolean; sortOrder: number; active: boolean };
type Service = { id: string; name: string; shortName: string; active: boolean };
type Price = { itemTypeId: string; serviceId: string; amount: number; maxAmount: number | null; active: boolean };

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
        <CardHeader title="Grille de prix" description="Articles et tarifs par service. Sans tarif, la combinaison n'est pas proposée au dépôt."
          action={<div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-[#2F4797]" />Inactifs</label>
            <Button size="sm" variant="secondary" onClick={() => setEditService("new")}><Plus />Service</Button>
            <Button size="sm" onClick={() => setEditItem("new")}><Plus />Article</Button>
          </div>} />
        {/* Téléphone : une carte par article, tarifs en résumé */}
        <ul className="divide-y divide-line border-t border-line md:hidden">
          {visibleItems.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-3">Aucun article. Ajoutez le premier avec « Article ».</li>}
          {visibleItems.map((i) => {
            const ip = visibleServices.map((s) => ({ s, p: prices.find((x) => x.itemTypeId === i.id && x.serviceId === s.id && x.active) })).filter((x) => x.p);
            return (
              <li key={i.id}>
                <button onClick={() => setEditItem(i)} className={cn("flex w-full items-center gap-3 px-5 py-3 text-left active:bg-subtle", !i.active && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <p className={cn("flex items-center gap-1.5 font-medium", !i.active && "line-through")}>{i.isFrequent && <Star className="size-3.5 fill-warning text-warning" aria-label="Fréquent" />}{i.name}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-3">
                      {ip.length ? ip.map(({ s, p }) => <span key={s.id}>{s.shortName} <Money value={p!.amount} unit={false} />{p!.maxAmount != null && <> – <Money value={p!.maxAmount} unit={false} /></>}</span>) : "Aucun tarif"}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-ink-3" />
                </button>
              </li>
            );
          })}
          {visibleServices.length > 0 && (
            <li className="flex flex-wrap gap-2 px-5 py-3">
              <span className="w-full text-[12.5px] font-medium uppercase tracking-[0.04em] text-ink-3">Services</span>
              {visibleServices.map((s) => (
                <button key={s.id} onClick={() => setEditService(s)} className={cn("h-9 rounded-full border border-line-2 px-3 text-[13px] font-medium", !s.active && "text-ink-3 line-through")}>{s.name}</button>
              ))}
            </li>
          )}
        </ul>
        <div className="hidden overflow-x-auto border-t border-line md:block">
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
                    return (
                      <td key={s.id} className="px-2 py-1.5 text-right">
                        <PriceCell itemTypeId={i.id} serviceId={s.id} initial={p?.active ? p.amount : null} onSaved={refresh} />
                        {p?.active && p.maxAmount != null && <button onClick={() => setEditItem(i)} className="block w-full px-2 text-right text-[12px] text-ink-3 tnum">jusqu&apos;à <Money value={p.maxAmount} unit={false} /></button>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">Prix en multiples de 100 FCFA, enregistrés à la sortie du champ. Prix variable (ex. 1 000 à 2 000) : ouvrez l&apos;article et renseignez « jusqu&apos;à ». Un changement de tarif n&apos;affecte pas les commandes existantes.</p>
      </Card>

      {editItem && <ItemDialog item={editItem === "new" ? null : editItem} nextOrder={items.length} services={services.filter((x) => x.active)} prices={prices} onClose={() => setEditItem(null)} onDone={() => { setEditItem(null); refresh(); }} />}
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

/** Bouton de suppression en deux temps (évite les suppressions accidentelles). */
function DeleteButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={cn("mr-auto text-danger hover:bg-danger-50", armed && "bg-danger-50")}>
      <Trash2 />{armed ? "Confirmer la suppression" : "Supprimer"}
    </Button>
  );
}

function ItemDialog({ item, nextOrder, services, prices, onClose, onDone }: { item: Item | null; nextOrder: number; services: Service[]; prices: Price[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<Omit<Item, "id">>(item ?? { name: "", isFrequent: true, sortOrder: nextOrder, active: true });
  const [amounts, setAmounts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(services.map((s) => {
      const p = item && prices.find((x) => x.itemTypeId === item.id && x.serviceId === s.id && x.active);
      return [s.id, p ? p.amount : null];
    })));
  const [maxes, setMaxes] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(services.map((s) => {
      const p = item && prices.find((x) => x.itemTypeId === item.id && x.serviceId === s.id && x.active);
      return [s.id, p?.maxAmount ?? null];
    })));
  const { exec, pending } = useAction();
  const badMax = (id: string) => maxes[id] != null && (amounts[id] == null || maxes[id]! <= amounts[id]! || maxes[id]! % 100 !== 0);
  const invalid = Object.values(amounts).some((a) => a !== null && (a < 100 || a % 100 !== 0)) || services.some((s) => badMax(s.id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item ? "Modifier l'article" : "Nouvel article"} description="Nom, tarifs par service et affichage au dépôt.">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          exec(() => saveItem({ ...f, id: item?.id, prices: services.map((s) => ({ serviceId: s.id, amount: amounts[s.id] ?? null, maxAmount: amounts[s.id] != null ? (maxes[s.id] ?? null) : null })) }),
            { success: item ? "Article modifié." : "Article créé.", onSuccess: onDone });
        }}>
          <Field label="Nom"><Input autoFocus required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ex. Chemise" /></Field>
          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 text-sm font-medium text-ink-2">Tarifs</legend>
            {services.length === 0 && <p className="text-sm text-ink-3">Créez d&apos;abord un service (ex. Lavage + repassage).</p>}
            {services.map((s) => (
              <Field key={s.id} label={s.name} error={badMax(s.id) ? "Le prix maximal doit dépasser le prix (multiple de 100)." : undefined}
                hint={amounts[s.id] === null ? "Laisser vide si le service n'est pas proposé pour cet article." : amounts[s.id]! % 100 !== 0 ? "Multiple de 100 FCFA." : "Prix variable : renseignez « jusqu'à », le prix se choisit au dépôt."}>
                <div className="grid grid-cols-2 gap-2">
                  <AmountInput value={amounts[s.id]} onChange={(v) => setAmounts({ ...amounts, [s.id]: v })} placeholder="—" aria-label={`Prix ${s.name}`} />
                  <AmountInput value={maxes[s.id]} onChange={(v) => setMaxes({ ...maxes, [s.id]: v })} placeholder="jusqu'à (facultatif)" aria-label={`Prix maximal ${s.name}`} disabled={amounts[s.id] == null} />
                </div>
              </Field>
            ))}
          </fieldset>
          <Field label="Ordre d'affichage"><Input type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: parseInt(e.target.value || "0", 10) })} /></Field>
          <Toggle checked={f.isFrequent} onChange={(b) => setF({ ...f, isFrequent: b })} label="Bouton rapide au dépôt (article fréquent)" />
          <Toggle checked={f.active} onChange={(b) => setF({ ...f, active: b })} label="Actif (proposé au dépôt)" />
          <DialogFooter>
            {item && <DeleteButton pending={pending} onConfirm={() => exec(() => deleteItemType({ id: item.id }), { success: "Article supprimé.", onSuccess: onDone })} />}
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending} disabled={invalid || f.name.trim().length < 2}>Enregistrer</SaveButton>
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
            {service && <DeleteButton pending={pending} onConfirm={() => exec(() => deleteService({ id: service.id }), { success: "Service supprimé.", onSuccess: onDone })} />}
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
