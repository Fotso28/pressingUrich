import "server-only";
import { z } from "zod";
import { fr } from "zod/v4/locales";

// Messages de validation en français par défaut (ceux qui ne sont pas personnalisés dans les schémas).
z.config(fr());
import { AuthError } from "./session";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Erreur métier dont le message peut être montré tel quel à l'utilisateur. */
export class DomainError extends Error {}

export function fail(message: string): never {
  throw new DomainError(message);
}

/** Exécute une action et convertit toute erreur en résultat typé `{ ok: false, error }`. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof DomainError || e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Données invalides." };
    console.error("[action]", e);
    return { ok: false, error: "Erreur serveur, réessayez." };
  }
}

/** Code d'erreur Postgres, y compris quand il est enveloppé par Drizzle. */
export function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}
