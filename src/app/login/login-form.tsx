"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm({ from }: { from: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const id = login.trim();
      const res = id.includes("@")
        ? await authClient.signIn.email({ email: id.toLowerCase(), password })
        : await authClient.signIn.username({ username: id.toLowerCase(), password });
      if (res.error) {
        setError(res.error.status === 429 ? "Trop de tentatives. Patientez une minute avant de réessayer."
          : /ban/i.test(res.error.message ?? "") ? "Ce compte est désactivé. Contactez le gérant."
          : "Identifiants incorrects.");
        return;
      }
      router.replace(from);
      router.refresh();
    } catch {
      setError("Connexion impossible. Vérifiez Internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Identifiant ou email" htmlFor="login">
        <Input id="login" autoComplete="username" autoCapitalize="none" autoFocus required value={login} onChange={(e) => setLogin(e.target.value)} />
      </Field>
      <Field label="Mot de passe" htmlFor="password">
        <div className="relative">
          <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className="pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:text-ink" aria-label={show ? "Masquer" : "Afficher"}>
            {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
      </Field>
      {error && <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger">{error}</p>}
      <Button type="submit" size="lg" block loading={loading}>Se connecter</Button>
    </form>
  );
}
