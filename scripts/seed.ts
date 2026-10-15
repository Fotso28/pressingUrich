/**
 * Seed idempotent : crée le premier compte ADMIN, la ligne `settings` et un catalogue de base
 * (seulement si ces éléments n'existent pas encore). Les prix sont des exemples à ajuster
 * par le gérant dans Paramètres > Catalogue.
 *
 *   SEED_ADMIN_USERNAME=gerant SEED_ADMIN_PASSWORD=... pnpm db:seed
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as s from "../src/server/db/schema";

const ITEMS: [string, boolean, number, number, number][] = [
  // nom, fréquent, Lav+Rep, Rep, Sec (0 = non proposé)
  ["Chemise", true, 1000, 500, 1500],
  ["Pantalon", true, 1000, 500, 1500],
  ["Tee-shirt", true, 700, 300, 0],
  ["Robe", true, 1500, 700, 2500],
  ["Jupe", true, 1000, 500, 1500],
  ["Costume (2 pièces)", true, 0, 2000, 5000],
  ["Veste", true, 1500, 1000, 3000],
  ["Boubou", true, 2000, 1000, 3000],
  ["Kaba", false, 1500, 700, 2500],
  ["Pull", false, 1500, 700, 2000],
  ["Manteau", false, 0, 1500, 5000],
  ["Cravate", false, 0, 300, 1000],
  ["Drap", true, 1500, 700, 0],
  ["Couette", false, 5000, 0, 7000],
  ["Rideau", false, 3000, 1500, 4000],
];
const SERVICES: [string, string][] = [
  ["Lavage + repassage", "Lav+Rep"],
  ["Repassage seul", "Rep"],
  ["Nettoyage à sec", "Sec"],
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  let db;
  let close: () => Promise<void>;
  if (/\.neon\.tech/.test(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    db = drizzleNeon({ client: pool, schema: s });
    close = () => pool.end();
  } else {
    const pool = new PgPool({ connectionString: url });
    db = drizzlePg({ client: pool, schema: s }) as unknown as typeof db;
    close = () => pool.end();
  }
  const d = db!;

  // 1. Gérant
  const admins = await d.select({ id: s.user.id }).from(s.user).where(eq(s.user.role, "ADMIN")).limit(1);
  if (admins.length === 0) {
    const username = (process.env.SEED_ADMIN_USERNAME ?? "gerant").toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.length < 6) throw new Error("SEED_ADMIN_PASSWORD (6 caractères min.) requis pour créer le gérant");
    const id = randomUUID();
    await d.insert(s.user).values({
      id, name: process.env.SEED_ADMIN_NAME ?? "Gérant", email: `${username}@pressing.local`,
      emailVerified: true, username, displayUsername: username, role: "ADMIN",
    });
    await d.insert(s.account).values({
      id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password),
    });
    console.log(`Gérant créé : identifiant « ${username} ».`);
  } else console.log("Gérant déjà présent.");

  // 2. Paramètres
  await d.insert(s.settings).values({
    id: 1, shopName: "Continental Pressing", address: "Douala", phones: "",
    ticketFooter: "Vêtements non retirés après 30 jours : non garantis.",
  }).onConflictDoNothing();

  // 3. Catalogue
  const existing = await d.select({ id: s.itemTypes.id }).from(s.itemTypes).limit(1);
  if (existing.length === 0) {
    const svc = await d.insert(s.services).values(SERVICES.map(([name, shortName]) => ({ name, shortName }))).returning();
    const items = await d.insert(s.itemTypes).values(ITEMS.map(([name, isFrequent], i) => ({ name, isFrequent, sortOrder: i }))).returning();
    const rows = items.flatMap((it) => {
      const def = ITEMS.find(([n]) => n === it.name)!;
      return svc.map((sv, j) => ({ itemTypeId: it.id, serviceId: sv.id, amount: def[2 + j] as number }))
        .filter((p) => p.amount > 0);
    });
    await d.insert(s.prices).values(rows);
    console.log(`Catalogue créé : ${items.length} articles × ${svc.length} services, ${rows.length} prix.`);
  } else console.log("Catalogue déjà présent.");

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
