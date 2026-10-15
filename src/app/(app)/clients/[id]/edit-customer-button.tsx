"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateCustomer } from "@/server/actions/customers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";

type C = { id: string; fullName: string; phone: string; address: string; notes: string };

export function EditCustomerButton({ customer }: { customer: C }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(customer);
  const { exec, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(customer); }}>
      <Button variant="secondary" onClick={() => setOpen(true)}><Pencil />Modifier</Button>
      <DialogContent title="Modifier le client">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); exec(() => updateCustomer(f), { success: "Client mis à jour.", onSuccess: () => { setOpen(false); router.refresh(); } }); }}>
          <Field label="Nom complet"><Input required value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
          <Field label="Téléphone"><Input required inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="tnum" /></Field>
          <Field label="Adresse"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
            <SaveButton type="submit" loading={pending}>Enregistrer</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
