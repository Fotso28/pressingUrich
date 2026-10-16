import "server-only";
import { auth } from "../auth";
import type { Snapshot } from "@/lib/offline/types";

/** Session de l'appel API (cookie) : utilisateur et date d'expiration, ou null. */
export async function apiSession(req: Request): Promise<{ user: Snapshot["user"]; expiresAt: Date } | null> {
  const s = await auth.api.getSession({ headers: req.headers });
  if (!s || s.user.banned) return null;
  return {
    user: { id: s.user.id, name: s.user.name, username: s.user.username ?? null, role: s.user.role === "ADMIN" ? "ADMIN" : "AGENT" },
    expiresAt: new Date(s.session.expiresAt),
  };
}
