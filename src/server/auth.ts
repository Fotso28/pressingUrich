import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, username } from "better-auth/plugins";
import { ac, roles } from "@/lib/permissions";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./db/schema";

// Sur Vercel, les URL de prévisualisation changent à chaque déploiement : on les accepte aussi.
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((h): h is string => !!h)
  .map((h) => `https://${h}`);

export const auth = betterAuth({
  appName: "Continental Pressing",
  baseURL: process.env.BETTER_AUTH_URL ?? vercelOrigins[0],
  trustedOrigins: vercelOrigins,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
  // F-AUTH-03 : pas d'inscription publique, les comptes sont créés par le gérant.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 6 },
  // F-AUTH-02 : la session glisse d'un jour à chaque usage et expire après 7 jours d'inactivité.
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  advanced: { database: { generateId: () => crypto.randomUUID() } },
  plugins: [
    username(),
    // Rôles métier en majuscules : ADMIN (gérant) a les droits d'administration, AGENT aucun.
    admin({ defaultRole: "AGENT", adminRoles: ["ADMIN"], ac, roles }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
