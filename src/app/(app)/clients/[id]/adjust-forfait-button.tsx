"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { adjustForfait } from "@/server/actions/forfaits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";
import { parseKg } from "@/lib/domain/kilo";
import { cn } from "@/lib/cn";

/** Correction du solde forfait d'un client par le gérant (ajout ou retrait de kilos), avec motif. */
export function AdjustForfaitButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sign, setSign] = useState<1 | -1>(1);
  const [kg, setKg] = useState("");
  const [reason, setReason] = useState("");
  const { exec, pending } = useAction();
  const grams = parseKg(kg);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><SlidersHorizontal />Corriger</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Corriger le solde forfait" description="Erreur de pesée, geste commercial… La correction est tracée.">
          <form className="space-y-4" onSubmit={(e) => {
            e.preventDefault();
            if (!grams) return;
            exec(() => adjustForfait({ customerId, grams: sign * grams, reason }), { success: "Solde corrigé.", onSuccess: () => { setOpen(false); setKg(""); setReason(""); router.refresh(); } });
          }}>
            <div className="grid grid-cols-2 rounded-lg border border-line-2 p-1">
              {([[1, "Ajouter"], [-1, "Retirer"]] as const).map(([s, l]) => (
                <button key={s} type="button" onClick={() => setSign(s)} className={cn("h-9 rounded-md text-sm font-medium", sign === s ? "bg-brand text-white" : "text-ink-2 hover:bg-subtle")}>{l}</button>
              ))}
            </div>
            <Field label="Poids (kg)"><Input inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="2,5" className="tnum" /></Field>
            <Field label="Motif"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ex. erreur de pesée du 12/10" /></Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <SaveButton type="submit" loading={pending} disabled={!grams || reason.trim().length < 3}>Enregistrer</SaveButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
