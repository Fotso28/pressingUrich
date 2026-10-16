"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { auth } from "../auth";
import { requireRole } from "../session";
import { fail, run } from "../action-utils";

const passwordSchema = z.string().min(8, "Mot de passe : 8 caractères minimum.").max(128);

function authMessage(e: unknown): never {
  const msg = (e as { body?: { message?: string }; message?: string })?.body?.message ?? (e as Error)?.message;
  if (msg && /exist|already|taken/i.test(msg)) fail("Cet identifiant est déjà utilisé.");
  throw e;
}

/** F-AUTH-03 : le gérant crée les comptes (identifiant + mot de passe provisoire). */
export async function createUser(raw: { name: string; username: string; password: string; role: "ADMIN" | "AGENT" }) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = z.object({
      name: z.string().trim().min(2, "Nom obligatoire.").max(80),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, "Identifiant : 3 à 30 caractères (lettres, chiffres, . _ -)."),
      password: passwordSchema,
      role: z.enum(["ADMIN", "AGENT"]),
    }).parse(raw);
    const [taken] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.username, input.username)).limit(1);
    if (taken) fail("Cet identifiant est déjà utilisé.");
    try {
      await auth.api.createUser({
        headers: await headers(),
        body: {
          email: `${input.username}@pressing.local`, password: input.password, name: input.name, role: input.role,
          data: { username: input.username, displayUsername: input.username },
        },
      });
    } catch (e) { authMessage(e); }
    revalidatePath("/parametres/utilisateurs");
    return undefined;
  });
}

/** F-AUTH-04 : désactivation (bannissement Better Auth, sessions révoquées) ; l'historique reste. */
export async function setUserActive(raw: { userId: string; active: boolean }) {
  return run(async () => {
    const me = await requireRole("ADMIN");
    const { userId, active } = z.object({ userId: z.string().min(1), active: z.boolean() }).parse(raw);
    if (userId === me.id) fail("Vous ne pouvez pas désactiver votre propre compte.");
    const h = await headers();
    if (active) await auth.api.unbanUser({ headers: h, body: { userId } });
    else await auth.api.banUser({ headers: h, body: { userId, banReason: "Compte désactivé par le gérant" } });
    revalidatePath("/parametres/utilisateurs");
    return undefined;
  });
}

export async function resetUserPassword(raw: { userId: string; password: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { userId, password } = z.object({ userId: z.string().min(1), password: passwordSchema }).parse(raw);
    const h = await headers();
    await auth.api.setUserPassword({ headers: h, body: { userId, newPassword: password } });
    await auth.api.revokeUserSessions({ headers: h, body: { userId } });
    revalidatePath("/parametres/utilisateurs");
    return undefined;
  });
}

export async function setUserRole(raw: { userId: string; role: "ADMIN" | "AGENT" }) {
  return run(async () => {
    const me = await requireRole("ADMIN");
    const { userId, role } = z.object({ userId: z.string().min(1), role: z.enum(["ADMIN", "AGENT"]) }).parse(raw);
    if (userId === me.id) fail("Vous ne pouvez pas changer votre propre rôle.");
    await auth.api.setRole({ headers: await headers(), body: { userId, role } });
    revalidatePath("/parametres/utilisateurs");
    return undefined;
  });
}

/** Renommer un compte (nom affiché sur les tickets, la caisse et les salaires). */
export async function renameUser(raw: { userId: string; name: string }) {
  return run(async () => {
    await requireRole("ADMIN");
    const { userId, name } = z.object({ userId: z.string().min(1), name: z.string().trim().min(2, "Nom obligatoire.").max(80, "Nom trop long.") }).parse(raw);
    const res = await db.update(userTable).set({ name, updatedAt: new Date() }).where(eq(userTable.id, userId)).returning({ id: userTable.id });
    if (!res.length) fail("Compte introuvable.");
    revalidatePath("/", "layout");
    return undefined;
  });
}
