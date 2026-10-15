import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-medium text-brand">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page introuvable</h1>
        <p className="mt-2 text-ink-3">Cette commande ou cette page n&apos;existe pas.</p>
        <Button asChild className="mt-6"><Link href="/">Retour à l&apos;accueil</Link></Button>
      </div>
    </main>
  );
}
