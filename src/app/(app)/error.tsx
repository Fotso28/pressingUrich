"use client";

import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-center">
      <div>
        <h1 className="text-xl font-semibold">Une erreur est survenue</h1>
        <p className="mt-2 text-ink-3">Vérifiez la connexion Internet puis réessayez.</p>
        <Button className="mt-6" onClick={reset}>Réessayer</Button>
      </div>
    </div>
  );
}
