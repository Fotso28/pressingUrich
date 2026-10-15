"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { openCashSession } from "@/server/actions/cash";
import { AmountInput } from "@/components/ui/field";
import { SaveButton } from "@/components/save-button";
import { useAction } from "@/lib/use-action";

/** Encart d'ouverture de caisse (App Flow §2.4). */
export function OpenCashCard({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number | null>(null);
  const { exec, pending } = useAction();
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-brand-100 bg-brand-50/60 p-5 sm:flex-row sm:items-center">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface text-brand ring-1 ring-brand-100"><Wallet className="size-5" /></span>
      <div className="flex-1">
        <p className="font-semibold text-ink">Votre caisse n&apos;est pas ouverte</p>
        {!compact && <p className="text-sm text-ink-2">Saisissez le fond de caisse en espèces pour pouvoir encaisser.</p>}
      </div>
      <form className="flex gap-2 sm:w-[340px]" onSubmit={(e) => {
        e.preventDefault();
        exec(() => openCashSession({ openingFloat: amount ?? 0 }), { success: "Caisse ouverte.", onSuccess: () => router.refresh() });
      }}>
        <div className="flex-1"><AmountInput value={amount} onChange={setAmount} placeholder="Fond de caisse" aria-label="Fond de caisse" /></div>
        <SaveButton type="submit" loading={pending}>Ouvrir</SaveButton>
      </form>
    </div>
  );
}
