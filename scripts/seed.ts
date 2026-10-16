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
import { eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as s from "../src/server/db/schema";

const ITEMS: [string, boolean, number, number, number][] = [
  // nom, fréquent, Lav+Rep, Rep, Sec (0 = non proposé) — articles hors de la grille officielle (voir CATALOG_V2)
  ["Pantalon", true, 1000, 500, 1500],
  ["Tee-shirt", true, 700, 300, 0],
  ["Robe", true, 1500, 700, 2500],
  ["Veste", true, 1500, 1000, 3000],
  ["Kaba", false, 1500, 700, 2500],
  ["Pull", false, 1500, 700, 2000],
  ["Manteau", false, 0, 1500, 5000],
  ["Rideau", false, 3000, 1500, 4000],
];

/**
 * Grille de prix officielle de Continental Pressing Express (lavage + repassage), de « Blouson » à « Jupe ».
 * [nom, fréquent, prix, prix maximal si le prix varie selon l'article]
 */
const CATALOG_V2: [string, boolean, number, number | null][] = [
  ["Blouson et blouse", true, 1000, 2000],
  ["Boubou simple (courte taille)", true, 800, 1000],
  ["Boubou blanc (courte taille)", false, 1000, null],
  ["Bermudas, caleçon et string", false, 500, null],
  ["Chaussette", false, 500, null],
  ["Chemise simple", true, 500, null],
  ["Chemise blanche, pagne et djin", true, 1000, null],
  ["Chemise police", false, 1000, null],
  ["Costume enfant", false, 1500, null],
  ["Costume enfant blanc", false, 1500, null],
  ["Costume adulte", true, 2000, null],
  ["Ensemble grand et enfant", false, 2500, 3000],
  ["Couverture ou couvre-lit blanc", false, 4500, 5000],
  ["Cravate, nœud papillon, ceinture, foulard", false, 700, null],
  ["Culotte adulte", false, 1000, null],
  ["Culotte adulte blanche", false, 500, null],
  ["Culotte enfant", false, 600, null],
  ["Culotte enfant blanche", false, 500, null],
  ["Tennis et chaussure de couleur", false, 1500, 5000], // « à partir de 1 500 »
  ["Tennis et chaussure blanche", false, 1000, null],
  ["Drap simple", true, 1500, null],
  ["Drap blanc", false, 2000, null],
  ["Drap doublé", false, 2000, null],
  ["Drap doublé blanc", false, 500, null],
  ["Débardeur et singlette", false, 2000, null],
  ["Gandoura dame (une pièce)", false, 2500, null],
  ["Gandoura dame blanche (une pièce)", false, 2500, null],
  ["Gandoura homme (trois pièces)", false, 4000, null],
  ["Gandoura homme blanche (trois pièces)", false, 5000, 7000],
  ["Jupe", true, 500, 8000],
];
/** Anciens articles remplacés par la grille officielle : désactivés (gardés pour l'historique des commandes). */
const REPLACED_BY_V2 = ["Chemise", "Boubou", "Costume (2 pièces)", "Cravate", "Drap", "Couette"];
const SERVICES: [string, string][] = [
  ["Lavage + repassage", "Lav+Rep"],
  ["Repassage seul", "Rep"],
  ["Nettoyage à sec", "Sec"],
];

// `--if-configured` (build Vercel) : n'échoue pas si aucun mot de passe de gérant n'est fourni.
const IF_CONFIGURED = process.argv.includes("--if-configured");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (IF_CONFIGURED) { console.warn("DATABASE_URL absent : seed ignoré."); return; }
    throw new Error("DATABASE_URL manquant");
  }
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
    if (!password || password.length < 6) {
      if (IF_CONFIGURED) { console.warn("SEED_ADMIN_PASSWORD absent : gérant non créé."); await close(); return; }
      throw new Error("SEED_ADMIN_PASSWORD (6 caractères min.) requis pour créer le gérant");
    }
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

  // 4. Grille de prix officielle (une seule fois : ensuite, le gérant la modifie dans Paramètres › Catalogue).
  const [cv] = await d.select().from(s.appMeta).where(eq(s.appMeta.key, "catalog_version")).limit(1);
  if (!cv || Number(cv.value) < 2) {
    let [lr] = await d.select().from(s.services).where(eq(s.services.shortName, "Lav+Rep")).limit(1);
    if (!lr) [lr] = await d.insert(s.services).values({ name: "Lavage + repassage", shortName: "Lav+Rep" }).returning();
    await d.update(s.itemTypes).set({ active: false, isFrequent: false, updatedAt: new Date() }).where(inArray(s.itemTypes.name, REPLACED_BY_V2));
    for (const [i, [name, isFrequent, amount, maxAmount]] of CATALOG_V2.entries()) {
      const [it] = await d.insert(s.itemTypes).values({ name, isFrequent, sortOrder: i, active: true })
        .onConflictDoUpdate({ target: s.itemTypes.name, set: { isFrequent, sortOrder: i, active: true, updatedAt: new Date() } }).returning();
      await d.insert(s.prices).values({ itemTypeId: it.id, serviceId: lr.id, amount, maxAmount })
        .onConflictDoUpdate({ target: [s.prices.itemTypeId, s.prices.serviceId], set: { amount, maxAmount, active: true, updatedAt: new Date() } });
    }
    // Les articles restants (hors grille) passent après la grille dans l'ordre d'affichage.
    await d.execute(sql`update item_types set sort_order = sort_order + 100 where name not in (${sql.join(CATALOG_V2.map(([n]) => sql`${n}`), sql`, `)}) and sort_order < 100`);
    await d.insert(s.appMeta).values({ key: "catalog_version", value: "2" })
      .onConflictDoUpdate({ target: s.appMeta.key, set: { value: "2", updatedAt: new Date() } });
    console.log(`Grille de prix officielle appliquée : ${CATALOG_V2.length} articles.`);
  }

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
