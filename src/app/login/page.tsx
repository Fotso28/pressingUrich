import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { getSettings } from "@/server/queries/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

/** Retour après connexion : chemin interne uniquement (pas de « //site » ni « /\site »). */
const safeFrom = (from?: string) => (from && /^\/(?!\/|\\)/.test(from) ? from : "/");

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  if (await getCurrentUser()) redirect(safeFrom(from));
  const settings = await getSettings();
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={settings.shopName} width={260} height={100} className="h-auto w-[240px]" />
          <h1 className="sr-only">{settings.shopName}</h1>
          <p className="mt-5 text-sm text-ink-3">Connectez-vous pour ouvrir le comptoir</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
          <LoginForm from={safeFrom(from)} />
        </div>
      </div>
    </main>
  );
}
