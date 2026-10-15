"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettings } from "@/server/actions/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";

type S = {
  shopName: string; address: string; phones: string; ticketFooter: string;
  standardDelayHours: number; expressDelayHours: number; expressRatePct: number; abandonedAfterDays: number; agentMaxDiscountPct: number;
};

function NumberField({ label, unit, value, onChange, hint }: { label: string; unit: string; value: number; onChange: (n: number) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <Input inputMode="numeric" value={Number.isNaN(value) ? "" : value} onChange={(e) => onChange(parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} className="pr-14 text-right tnum" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-3">{unit}</span>
      </div>
    </Field>
  );
}

export function ShopSettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const { exec, pending } = useAction();
  const set = <K extends keyof S>(k: K, v: S[K]) => setS((x) => ({ ...x, [k]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); exec(() => updateSettings(s), { success: "Paramètres enregistrés.", onSuccess: () => router.refresh() }); }}
      className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Informations du ticket" description="Imprimées en tête et en pied de ticket." />
        <div className="space-y-4 border-t border-line p-5">
          <Field label="Nom du pressing"><Input required value={s.shopName} onChange={(e) => set("shopName", e.target.value)} /></Field>
          <Field label="Adresse"><Input value={s.address} onChange={(e) => set("address", e.target.value)} placeholder="ex. Bonamoussadi, Douala" /></Field>
          <Field label="Téléphones"><Input value={s.phones} onChange={(e) => set("phones", e.target.value)} placeholder="6 99 00 00 00 / 6 77 00 00 00" /></Field>
          <Field label="Mention de bas de ticket"><Textarea rows={3} value={s.ticketFooter} onChange={(e) => set("ticketFooter", e.target.value)} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Délais et taux" description="Valeurs utilisées au dépôt." />
        <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
          <NumberField label="Délai standard" unit="heures" value={s.standardDelayHours} onChange={(v) => set("standardDelayHours", v)} />
          <NumberField label="Délai express" unit="heures" value={s.expressDelayHours} onChange={(v) => set("expressDelayHours", v)} />
          <NumberField label="Majoration express" unit="%" value={s.expressRatePct} onChange={(v) => set("expressRatePct", v)} />
          <NumberField label="Plafond de remise agent" unit="%" value={s.agentMaxDiscountPct} onChange={(v) => set("agentMaxDiscountPct", v)} hint="Au-delà, seul le gérant peut accorder la remise." />
          <NumberField label="Seuil de souffrance" unit="jours" value={s.abandonedAfterDays} onChange={(v) => set("abandonedAfterDays", v)} hint="Prête et non retirée depuis plus de N jours." />
        </div>
      </Card>
      <div className="xl:col-span-2 flex justify-end">
        <SaveButton type="submit" size="lg" loading={pending}>Enregistrer les paramètres</SaveButton>
      </div>
    </form>
  );
}
