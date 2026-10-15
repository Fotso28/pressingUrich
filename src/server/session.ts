import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type Role = "ADMIN" | "AGENT";
export interface CurrentUser { id: string; name: string; username: string | null; role: Role }

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s || s.user.banned) return null;
  return {
    id: s.user.id,
    name: s.user.name,
    username: s.user.username ?? null,
    role: s.user.role === "ADMIN" ? "ADMIN" : "AGENT",
  };
});

export class AuthError extends Error {}

/** Contrôle d'accès des Server Actions : lève une erreur au lieu de rediriger. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Session expirée, reconnectez-vous.");
  return u;
}

export async function requireRole(role: Role): Promise<CurrentUser> {
  const u = await requireUser();
  if (role === "ADMIN" && u.role !== "ADMIN") throw new AuthError("Action réservée au gérant.");
  return u;
}

/** Pour les pages : redirige vers /login ou vers l'accueil. */
export async function pageUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function pageAdmin(): Promise<CurrentUser> {
  const u = await pageUser();
  if (u.role !== "ADMIN") redirect("/?refus=1");
  return u;
}
