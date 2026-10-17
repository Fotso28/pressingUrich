/**
 * Jeu de données de démonstration réaliste (à lancer après `pnpm db:seed`).
 *
 *  - Période : de DEMO_START (défaut 2025-11-01) à aujourd'hui.
 *  - Charges : loyer 75 000 / mois payé par trimestre (225 000 tous les 3 mois), eau 15 000,
 *    salaires 75 000 + 45 000 (versés aux comptes des agents), intrants 30 000–50 000, TV Canal+ 5 000,
 *    électricité 30 000–50 000, autres 10 000–30 000. Le mois en cours n'a pas encore réglé eau,
 *    électricité ni salaires (payés en fin de mois).
 *    Le mois du loyer cumule donc 3 × 75 000 + toutes les autres charges : son bénéfice est nettement plus bas.
 *  - Bénéfice moyen des mois complets : 440 000 FCFA (CA encaissé ≈ 620 000 – 890 000) ; les deux derniers mois
 *    (dernier mois complet et mois en cours, au rythme du mois) sont les plus faibles.
 *  - Tous les montants sont des multiples de 100 FCFA, le plus souvent de 500.
 *  - Clients aux noms camerounais ; 70 % sont des habitués qui reviennent régulièrement.
 *  - Deux agents comptoir, une session de caisse par agent et par jour, dépenses, clôtures.
 *
 *   pnpm db:seed-demo                 # refuse si des commandes existent déjà
 *   DEMO_RESET=1 pnpm db:seed-demo    # efface les données métier puis régénère
 *
 * Au build Vercel (`--if-empty`, SEED_DEMO=1) : génère si la base est vide, ou régénère une fois
 * quand DEMO_VERSION change (version enregistrée dans app_meta).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import { and, eq, sql } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { hashPassword } from "better-auth/crypto";
import * as s from "../src/server/db/schema";
import { normalizeName, normalizePhone } from "../src/lib/domain/normalize";

const TZ = "Africa/Douala";
const START = process.env.DEMO_START ?? "2025-11-01";
const DEMO_VERSION = "9";
// Charges fixes mensuelles (FCFA)
const RENT = 75_000, WATER = 15_000, TV = 5_000;
const RENT_EVERY = 3; // loyer payé par trimestre, le premier mois du trimestre
const SALARIES = [75_000, 45_000]; // agent 1, agent 2
// Bénéfice moyen visé sur les mois complets (les mois de loyer gagnent moins, les autres plus).
const PROFIT_AVG = 440_000;
/**
 * Forme du CA des mois complets, du plus ancien au plus récent, en écart à un niveau de base (fêtes de fin d'année
 * fortes, creux de janvier, bonne saison sèche, ralentissement de saison des pluies). Le niveau de base est calculé
 * pour que le bénéfice moyen vaille PROFIT_AVG. Les deux derniers mois (dernier mois complet et mois en cours,
 * REV_SHAPE_CURRENT au rythme d'un mois entier) sont les plus faibles.
 */
const REV_SHAPE = [-7_000, 137_000, -77_000, 15_000, 65_000, 106_000, 37_000, -29_000, -54_000, 0, -127_000];
const REV_SHAPE_CURRENT = -120_000;
/** Multiple de `step` le plus proche. */
const roundTo = (v: number, step = 500) => Math.round(v / step) * step;
/** Montant aléatoire multiple de 500 entre a et b (bornes incluses, multiples de 500). */
const amount500 = (a: number, b: number) => a + 500 * int(0, (b - a) / 500);
const N_REGULAR = 170, N_OCCASIONAL = 73; // 70 % d'habitués

// --- Aléatoire déterministe -------------------------------------------------
let seed = 20251101;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
function weighted<T>(xs: readonly T[], w: (x: T) => number): T {
  const total = xs.reduce((a, x) => a + w(x), 0);
  let r = rnd() * total;
  for (const x of xs) { r -= w(x); if (r <= 0) return x; }
  return xs[xs.length - 1];
}

// --- Noms camerounais -------------------------------------------------------
const SURNAMES = ["Ngono", "Mbarga", "Atangana", "Essomba", "Fouda", "Onana", "Nkoulou", "Tchoupo", "Kamga", "Fotso", "Tchinda", "Nguemo", "Kamdem", "Talla", "Djoumessi", "Nana", "Ebode", "Abena", "Bilong", "Ndjock", "Mballa", "Owona", "Manga", "Ndongo", "Ewane", "Ekwalla", "Dikongue", "Moukoko", "Ngo Bassong", "Njoya", "Mouliom", "Ngah", "Tagne", "Simo", "Noumbissi", "Wamba", "Tchakounte", "Feudjio", "Kenfack", "Tsafack", "Youmbi", "Nzalli", "Hamadou", "Bouba", "Oumarou", "Ngassa", "Pokam", "Zang", "Mvondo", "Ekambi", "Mbida", "Nyobe", "Kotto", "Epee", "Ndoumbe", "Priso", "Ngando", "Etoundi", "Mengue", "Biloa", "Amougou", "Eyenga", "Nkodo", "Tchatchoua", "Djomo", "Kuate", "Tiwa", "Ngoumou", "Belinga", "Ondoa", "Mbock", "Nlend", "Tonye", "Bisseck", "Ngo Ndjeng", "Abessolo", "Medjo", "Nnanga", "Sadou", "Aboubakar", "Yaya", "Mefire", "Foning", "Kengne", "Wandji", "Ndam", "Mfopit", "Njikam"];
const FIRST = ["Marie", "Jeanne", "Pauline", "Brigitte", "Cécile", "Odile", "Rose", "Christelle", "Laure", "Sandrine", "Nadège", "Murielle", "Carine", "Estelle", "Vanessa", "Linda", "Arlette", "Josiane", "Clarisse", "Aminatou", "Hadjara", "Ramatou", "Mireille", "Gisèle", "Prisca", "Michèle", "Françoise", "Hortense", "Gaëlle", "Flore", "Edwige", "Viviane", "Jean", "Paul", "Pierre", "Emmanuel", "Serge", "Hervé", "Thierry", "Patrick", "Christian", "Alain", "Roger", "Blaise", "Achille", "Franck", "Boris", "Landry", "Yannick", "Martial", "Arnaud", "Cyrille", "Rodrigue", "Ibrahim", "Moussa", "Abdou", "Samuel", "Joseph", "Daniel", "Stéphane", "Guy", "Armel", "Fabrice", "Herman", "Valentin", "Eric", "Olivier"];
const QUARTIERS = ["Bonamoussadi", "Makepe", "Logpom", "Kotto", "Bonapriso", "Akwa", "Deïdo", "Bali", "Ndokoti", "Logbessou", "Bepanda", "PK14", "Cité des Palmiers", "Japoma", "Yassa", "Bonabéri"];
const COLORS = ["blanc", "bleu ciel", "noir", "gris", "beige", "bleu marine", "rouge", "vert", "rose", "bordeaux", "jaune", "multicolore"];
const BRANDS = ["Zara", "H&M", "Celio", "Hugo Boss", "Lacoste", "Mango", "Pagne Vlisco", "Tissu local", "Ralph Lauren", "Sans marque"];
const OBS = ["tache au col", "tache d'huile", "bouton manquant", "petite déchirure à la manche", "tache de vin", "ourlet décousu", "col jauni", "tache d'encre", "fermeture éclair fragile"];
// Petites dépenses payées à la caisse (comptées dans les intrants ou les autres dépenses du mois).
const CASH_INTRANTS = [["Lessive (sac 5 kg)", 4500], ["Eau de Javel", 1500], ["Cintres et housses", 2500], ["Sachets plastiques", 1500], ["Détachant", 3000], ["Amidon", 2000]] as const;
const CASH_OTHER = [["Moto-taxi courses", 500], ["Transport livraison", 1000], ["Fournitures (stylos, carnets)", 1500], ["Eau potable", 500]] as const;
const ITEM_WEIGHT: Record<string, number> = {
  "Chemise simple": 22, "Chemise blanche, pagne et djin": 12, "Pantalon": 24, "Tee-shirt": 8, "Robe": 8, "Jupe": 6, "Costume adulte": 6, "Costume enfant": 2,
  "Veste": 4, "Blouson et blouse": 4, "Boubou simple (courte taille)": 5, "Boubou blanc (courte taille)": 2, "Kaba": 4, "Pull": 2, "Drap simple": 6, "Drap blanc": 2,
  "Drap doublé": 1, "Couverture ou couvre-lit blanc": 1, "Culotte adulte": 2, "Culotte enfant": 1, "Bermudas, caleçon et string": 2, "Chaussette": 2,
  "Cravate, nœud papillon, ceinture, foulard": 2, "Tennis et chaussure de couleur": 2, "Tennis et chaussure blanche": 2, "Ensemble grand et enfant": 2,
  "Gandoura homme (trois pièces)": 2, "Gandoura dame (une pièce)": 2, "Débardeur et singlette": 1, "Rideau": 1, "Manteau": 1,
};
const MANY = new Set(["Chemise simple", "Chemise blanche, pagne et djin", "Pantalon", "Tee-shirt", "Chaussette", "Culotte adulte", "Culotte enfant"]);
const DESCRIPTIONS = ["bleu à rayures", "manches longues", "col mao", "pagne wax jaune", "tissu fragile", "uniforme scolaire", "blanc cassé", "motifs fleuris",
  "taille enfant", "lin beige", "jean délavé", "costume gris anthracite", "tenue de cérémonie", "carreaux rouges", "brodé main"];
const KILO_DESCRIPTIONS = ["sac bleu", "linge de maison", "linge de la semaine", "sac de sport noir", "vêtements d'enfants", "draps et serviettes"];

// --- Dates à Douala ---------------------------------------------------------
const at = (y: number, m: number, d: number, h: number, mi: number) => new Date(new TZDate(y, m, d, h, mi, 0, TZ).getTime());
const local = (d: Date) => new TZDate(d.getTime(), TZ);
const addH = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
/** Ramène un instant dans les heures d'ouverture (7 h 30 – 19 h 30, fermé le dimanche). */
function shopHours(d: Date): Date {
  let z = local(d);
  if (z.getHours() < 8) z = new TZDate(z.getFullYear(), z.getMonth(), z.getDate(), 8, int(0, 59), 0, TZ);
  if (z.getHours() >= 19 && z.getMinutes() > 30 || z.getHours() >= 20) z = new TZDate(z.getFullYear(), z.getMonth(), z.getDate() + 1, 8, int(5, 59), 0, TZ);
  if (z.getDay() === 0) z = new TZDate(z.getFullYear(), z.getMonth(), z.getDate() + 1, 8, int(5, 59), 0, TZ);
  return new Date(z.getTime());
}
const dayKey = (d: Date) => { const z = local(d); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`; };
const monthKey = (d: Date) => dayKey(d).slice(0, 7);

// `--if-empty` (build Vercel) : ne s'exécute que si SEED_DEMO=1 et qu'aucune commande n'existe.
const IF_EMPTY = process.argv.includes("--if-empty");

/**
 * Passage en production réelle : `PURGE_DEMO_DATA=1` (une seule fois, au build) efface le jeu de démonstration —
 * commandes, clients, caisses, paiements, dépenses, sorties, numéros réservés et comptes de démo (paul, brigitte).
 * Le catalogue, les paramètres et le compte du gérant sont conservés. Sans effet si la base n'est pas une base de démo.
 */
async function purgeDemo(db: ReturnType<typeof drizzleNeon<typeof s>>) {
  const [meta] = await db.select().from(s.appMeta).where(eq(s.appMeta.key, "demo_version")).limit(1);
  if (!meta) { console.log("PURGE_DEMO_DATA : pas de jeu de démonstration dans cette base, rien n'est effacé."); return; }
  await db.execute(sql`TRUNCATE forfait_moves, offline_ops, reserved_numbers, outflows, cash_session_counts, expenses, payments, order_status_history, order_items, orders, cash_sessions, customers RESTART IDENTITY CASCADE`);
  await db.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
  const demo = await db.select({ id: s.user.id }).from(s.user).where(sql`${s.user.username} in ('paul', 'brigitte')`);
  for (const d of demo) {
    await db.delete(s.session).where(eq(s.session.userId, d.id));
    await db.delete(s.account).where(eq(s.account.userId, d.id));
    await db.delete(s.user).where(eq(s.user.id, d.id));
  }
  await db.update(s.user).set({ monthlySalary: null });
  await db.delete(s.appMeta).where(eq(s.appMeta.key, "demo_version"));
  console.log(`Jeu de démonstration effacé (${demo.length} compte(s) de démo supprimé(s)). Base prête pour la production.`);
}

async function main() {
  const purge = process.env.PURGE_DEMO_DATA === "1";
  if (IF_EMPTY && process.env.SEED_DEMO !== "1" && !purge) return;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  let db: ReturnType<typeof drizzleNeon<typeof s>>;
  let close: () => Promise<void>;
  if (/\.neon\.tech/.test(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    db = drizzleNeon({ client: pool, schema: s }); close = () => pool.end();
  } else {
    const pool = new PgPool({ connectionString: url });
    db = drizzlePg({ client: pool, schema: s }) as unknown as typeof db; close = () => pool.end();
  }

  if (purge) { await purgeDemo(db); await close(); return; }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.orders);
  const [meta] = await db.select().from(s.appMeta).where(eq(s.appMeta.key, "demo_version")).limit(1);
  let reset = process.env.DEMO_RESET === "1";
  if (n > 0 && IF_EMPTY) {
    if (meta?.value === DEMO_VERSION) { console.log("Données de démonstration à jour : seed ignoré."); await close(); return; }
    // Sécurité : on ne régénère que si la base a été remplie par ce script (demo_version présente).
    // Une base de production avec de vraies commandes n'a pas de demo_version : elle n'est jamais effacée.
    if (!meta) { console.log("Commandes réelles présentes (pas de jeu de démonstration) : seed ignoré, rien n'est effacé."); await close(); return; }
    console.log(`Jeu de démonstration v${meta?.value ?? "1"} → v${DEMO_VERSION} : régénération.`);
    reset = true;
  }
  if (n > 0 && !reset) throw new Error(`${n} commandes existent déjà. Relancez avec DEMO_RESET=1 pour tout effacer et régénérer.`);
  if (reset) {
    await db.execute(sql`TRUNCATE forfait_moves, offline_ops, reserved_numbers, outflows, cash_session_counts, expenses, payments, order_status_history, order_items, orders, cash_sessions, customers RESTART IDENTITY CASCADE`);
    await db.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    console.log("Données métier effacées.");
  }

  // Catalogue et gérant (créés par `pnpm db:seed`)
  const [admin] = await db.select().from(s.user).where(eq(s.user.role, "ADMIN")).limit(1);
  if (!admin) {
    if (IF_EMPTY) { console.warn("Aucun gérant : seed de démonstration ignoré."); await close(); return; }
    throw new Error("Aucun gérant : lancez d'abord `pnpm db:seed`.");
  }
  const catalog = await db.select({
    itemTypeId: s.prices.itemTypeId, serviceId: s.prices.serviceId, amount: s.prices.amount, maxAmount: s.prices.maxAmount, item: s.itemTypes.name, service: s.services.shortName,
  }).from(s.prices).innerJoin(s.itemTypes, eq(s.itemTypes.id, s.prices.itemTypeId)).innerJoin(s.services, eq(s.services.id, s.prices.serviceId))
    .where(and(eq(s.prices.active, true), eq(s.itemTypes.active, true), eq(s.services.active, true)));
  if (!catalog.length) throw new Error("Catalogue vide : lancez d'abord `pnpm db:seed`.");
  const items = [...new Set(catalog.map((c) => c.item))];
  const forfaits = (await db.select().from(s.forfaits).where(eq(s.forfaits.active, true))).sort((a, b) => a.grams - b.grams);
  const kiloTypes = (await db.select().from(s.kiloTypes).where(eq(s.kiloTypes.active, true))).sort((a, b) => a.sortOrder - b.sortOrder);

  await db.update(s.settings).set({ shopName: "Continental Pressing", address: "Logpom, Douala" })
    .where(and(eq(s.settings.id, 1), eq(s.settings.address, "Douala")));

  // Agents comptoir
  // Sur Vercel, pas de mot de passe par défaut connu de tous : DEMO_AGENT_PASSWORD est obligatoire.
  if (process.env.VERCEL && !process.env.DEMO_AGENT_PASSWORD) throw new Error("DEMO_AGENT_PASSWORD obligatoire pour créer les comptes de démonstration.");
  const agentPassword = process.env.DEMO_AGENT_PASSWORD ?? "agent123";
  if (agentPassword.length < 6) throw new Error("DEMO_AGENT_PASSWORD : 6 caractères minimum.");
  const agents: { id: string; name: string }[] = [];
  for (const [k, [username, name]] of ([["paul", "Paul Essomba"], ["brigitte", "Brigitte Ngo Bassong"]] as const).entries()) {
    const [existing] = await db.select().from(s.user).where(eq(s.user.username, username)).limit(1);
    if (existing) {
      // Salaire de base de l'employé (géré ensuite dans Dépenses › Salaires du mois).
      if (existing.monthlySalary == null) await db.update(s.user).set({ monthlySalary: SALARIES[k] }).where(eq(s.user.id, existing.id));
      agents.push({ id: existing.id, name: existing.name }); continue;
    }
    const id = randomUUID();
    await db.insert(s.user).values({ id, name, email: `${username}@pressing.local`, emailVerified: true, username, displayUsername: username, role: "AGENT", monthlySalary: SALARIES[k], createdAt: at(2025, 9, 25, 9, 0) });
    await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(agentPassword) });
    agents.push({ id, name });
  }
  const staff = [...agents, { id: admin.id, name: admin.name }];

  // Période : jusqu'à la fermeture du jour courant (19 h 30), pour que le tableau de bord du jour soit vivant
  // même quand le déploiement a lieu tôt le matin.
  const realNow = new Date();
  const zNow = local(realNow);
  const closing = at(zNow.getFullYear(), zNow.getMonth(), zNow.getDate(), 19, 30);
  const now = closing > realNow ? closing : realNow;
  const [sy, sm] = START.split("-").map(Number);
  const startDate = at(sy, sm - 1, 1, 0, 0);
  const months: { key: string; y: number; m: number; days: number; openDays: number[]; target: number }[] = [];
  for (let y = sy, m = sm - 1; at(y, m, 1, 0, 0) <= now; m === 11 ? (y++, m = 0) : m++) {
    const days = new TZDate(y, m + 1, 0, 12, 0, 0, TZ).getDate();
    const openDays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => at(y, m, d, 12, 0).getTime() <= now.getTime() && local(at(y, m, d, 12, 0)).getDay() !== 0);
    months.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, y, m, days, openDays, target: 0 });
  }
  // Budgets de charges par mois ; le CA visé suit REV_PROFILE et le bénéfice en découle.
  type Budget = { electricity: number; intrants: number; other: number; cashIntrants: number; cashOther: number };
  const full = months.filter((mo) => mo.openDays.length >= 20 || mo.openDays.includes(mo.days) || mo.openDays.includes(mo.days - 1));
  const budgets = new Map<string, Budget>();
  for (const mo of months) {
    const intrants = amount500(30_000, 50_000), other = amount500(10_000, 30_000);
    budgets.set(mo.key, {
      electricity: amount500(30_000, 50_000), intrants, other,
      // Une partie des intrants et des autres dépenses est réglée en petites sommes à la caisse.
      cashIntrants: roundTo(intrants * (0.25 + rnd() * 0.2)), cashOther: roundTo(Math.min(8_000, other * (0.25 + rnd() * 0.2))),
    });
  }
  const rentOf = (mo: (typeof months)[number]) => (months.indexOf(mo) % RENT_EVERY === 0 ? RENT * RENT_EVERY : 0);
  const monthCharges = (b: Budget, mo: (typeof months)[number]) => rentOf(mo) + WATER + TV + SALARIES[0] + SALARIES[1] + b.electricity + b.intrants + b.other;
  // CA visé : la forme est alignée sur les mois les plus récents (les plus faibles en dernier), puis décalée pour que
  // le bénéfice moyen (CA − toutes les charges du mois) vaille PROFIT_AVG.
  const shape = REV_SHAPE.slice(-full.length);
  while (shape.length < full.length) shape.unshift(0);
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  const base = roundTo(PROFIT_AVG + mean(full.map((mo) => monthCharges(budgets.get(mo.key)!, mo))) - mean(shape), 1000);
  full.forEach((mo, i) => { mo.target = base + shape[i]; });
  for (const mo of months) if (!mo.target) {
    // Mois en cours : objectif proratisé sur les jours ouvrés écoulés.
    const totalOpen = Array.from({ length: mo.days }, (_, i) => i + 1).filter((d) => local(at(mo.y, mo.m, d, 12, 0)).getDay() !== 0).length;
    mo.target = roundTo(((base + REV_SHAPE_CURRENT) * mo.openDays.length) / totalOpen, 1000);
  }

  // Clients : 70 % d'habitués
  // `kilo` : client au forfait (linge au kilo) ; `balance` : son solde forfait en grammes.
  type Cust = { id: string; fullName: string; phone: string; regular: boolean; repeat: boolean; rate: number; joinAt: Date; visits: number; lastAt: Date | null; address: string | null; firstAt: Date | null; kilo: boolean; balance: number };
  const usedPhones = new Set<string>();
  const phone = () => {
    for (;;) {
      const p = `6${pick(["7", "9", "5", "8", "7", "9", "7", "9"])}${String(int(0, 9_999_999)).padStart(7, "0")}`;
      if (!usedPhones.has(p)) { usedPhones.add(p); return p; }
    }
  };
  const usedNames = new Set<string>();
  const fullName = () => {
    for (;;) {
      const n = `${pick(SURNAMES)} ${pick(FIRST)}`;
      if (!usedNames.has(n)) { usedNames.add(n); return n; }
    }
  };
  const span = now.getTime() - startDate.getTime();
  const custs: Cust[] = [];
  for (let i = 0; i < N_REGULAR + N_OCCASIONAL; i++) {
    const regular = i < N_REGULAR;
    const joinAt = regular && chance(0.62) ? startDate : new Date(startDate.getTime() + rnd() * span * (regular ? 0.85 : 0.97));
    custs.push({
      id: randomUUID(), fullName: fullName(), phone: phone(), regular,
      rate: regular ? 1 / int(9, 30) : 0, repeat: chance(0.3), joinAt, visits: 0, lastAt: null, firstAt: null, kilo: regular && forfaits.length > 0 && chance(0.09), balance: 0,
      address: chance(0.45) ? pick(QUARTIERS) : null,
    });
  }
  const occasionalQueue = custs.filter((c) => !c.regular).sort((a, b) => a.joinAt.getTime() - b.joinAt.getTime());

  // Génération
  type Order = typeof s.orders.$inferInsert & { id: string };
  const orders: Order[] = [];
  const itemsRows: (typeof s.orderItems.$inferInsert)[] = [];
  const history: (typeof s.orderStatusHistory.$inferInsert)[] = [];
  const pays: (typeof s.payments.$inferInsert & { at: Date })[] = [];
  const moves: (typeof s.forfaitMoves.$inferInsert)[] = [];
  const sessions = new Map<string, { id: string; userId: string; day: string; openedAt: Date; closedAt: Date | null; float: number }>();
  const sessionFor = (userId: string, when: Date) => {
    const k = `${userId}|${dayKey(when)}`;
    let ss = sessions.get(k);
    if (!ss) {
      const z = local(when);
      const openedAt = at(z.getFullYear(), z.getMonth(), z.getDate(), 7, int(10, 25)); // avant le premier client (7 h 30)
      const closedAt = at(z.getFullYear(), z.getMonth(), z.getDate(), 19, int(35, 55));
      ss = { id: randomUUID(), userId, day: dayKey(when), openedAt, closedAt: dayKey(when) === dayKey(now) ? null : closedAt, float: pick([5000, 10000, 10000, 15000]) };
      sessions.set(k, ss);
    }
    return ss;
  };
  const worker = (when: Date) => (chance(0.12) ? staff[2] : agents[local(when).getDate() % 2 === 0 ? (chance(0.75) ? 0 : 1) : (chance(0.75) ? 1 : 0)]);
  const method = () => weighted(["ESPECES", "MTN_MOMO", "ORANGE_MONEY"] as const, (m) => (m === "ESPECES" ? 55 : m === "MTN_MOMO" ? 30 : 15));
  const addPayment = (orderId: string, amount: number, when: Date) => {
    if (amount <= 0 || when > now) return;
    const w = worker(when);
    const m = method();
    // La session de caisse est rattachée après la génération (le calage du CA rejoue chaque mois).
    pays.push({ id: randomUUID(), orderId, cashSessionId: "", method: m, amount, reference: m === "ESPECES" ? null : (chance(0.7) ? `${m === "MTN_MOMO" ? "MP" : "OM"}${int(100000000, 999999999)}` : null), idempotencyKey: randomUUID(), createdBy: w.id, createdAt: when, at: when });
  };

  let number = 0;
  /** Vente d'un forfait seul : ticket réglé en entier et clos aussitôt (rien à traiter à l'atelier). */
  const sellForfait = (c: Cust, at: Date): number => {
    if (at > now) return 0;
    const f = weighted(forfaits, (x) => (x.grams === 23_000 ? 60 : 20));
    const fid = randomUUID();
    const ag = worker(at);
    c.balance += f.grams;
    number++;
    orders.push({
      id: fid, number, customerId: c.id, status: "RETIREE", isExpress: false, expressRatePct: 0, subtotal: f.price, expressAmount: 0,
      discountType: null, discountValue: 0, discountAmount: 0, total: f.price, amountPaid: f.price, dueAt: at, notes: null,
      idempotencyKey: randomUUID(), createdBy: ag.id, createdAt: at, updatedAt: at, readyAt: at, collectedAt: at, collectedBy: ag.id,
      cancelledAt: null, cancelledBy: null, cancelReason: null,
    });
    itemsRows.push({ orderId: fid, lineNo: 1, kind: "FORFAIT", forfaitId: f.id, weightGrams: f.grams, itemLabel: f.name, serviceLabel: "Forfait", unitPrice: f.price, quantity: 1, lineTotal: f.price });
    history.push({ orderId: fid, fromStatus: null, toStatus: "DEPOSEE", changedBy: ag.id, changedAt: at });
    history.push({ orderId: fid, fromStatus: "DEPOSEE", toStatus: "RETIREE", changedBy: ag.id, changedAt: at, reason: "Vente de forfait" });
    addPayment(fid, f.price, addH(at, 0.01));
    moves.push({ customerId: c.id, orderId: fid, kind: "ACHAT", grams: f.grams, label: `Achat ${f.name}`, createdBy: ag.id, createdAt: at });
    return f.price;
  };
  /** Génère les dépôts d'un mois pour un montant total de commandes `target`. */
  const genMonth = (mo: (typeof months)[number], target: number) => {
    seed = 20251216 + 7919 * months.indexOf(mo); // même aléa à chaque essai du mois
    let monthAccum = 0;
    for (let di = 0; di < mo.openDays.length; di++) {
      const d = mo.openDays[di];
      const remainingDays = mo.openDays.length - di;
      const dayBudget = (target - monthAccum) / remainingDays * (0.75 + rnd() * 0.5);
      let dayTotal = 0;
      const dayOrders: { when: Date }[] = [];
      // Au moins 3 dépôts par jour ouvré : un comptoir n'est jamais vide.
      while (dayTotal < dayBudget || dayOrders.length < 3) {
        const when = new Date(at(mo.y, mo.m, d, 7, 30).getTime() + Math.floor(rnd() * 660) * 60_000); // 7 h 30 – 18 h 30
        if (when > now) break;
        // Choix du client : habitués pondérés par fréquence, occasionnels ~6 % des dépôts.
        let c: Cust | undefined;
        if (chance(0.075)) c = occasionalQueue.find((o) => o.joinAt <= when && (o.visits === 0 || (o.visits === 1 && o.repeat && when.getTime() - o.lastAt!.getTime() > 25 * 86_400_000)));
        if (!c) {
          const eligible = custs.filter((x) => x.regular && x.joinAt <= when && (!x.lastAt || when.getTime() - x.lastAt.getTime() > 4 * 86_400_000));
          c = weighted(eligible, (x) => x.rate * (x.lastAt ? Math.min(3, (when.getTime() - x.lastAt.getTime()) / 86_400_000 * x.rate) : 1.5));
        }
        c.visits++; c.lastAt = when; c.firstAt ??= when;

        // Articles : à la pièce, ou linge au kilo. Un forfait se vend toujours seul (ticket à part, réglé et clos aussitôt) :
        // le client au forfait le rachète au comptoir juste avant son dépôt quand son solde ne suffit plus.
        const id = randomUUID();
        // Linge au kilo : surtout les clients au forfait, parfois les autres (payé au prix du kilo).
        const kiloOrder = kiloTypes.length > 0 && (c.kilo ? chance(0.85) : chance(0.04));
        const lines: { cat: (typeof catalog)[number]; qty: number; price: number; description: string | null }[] = [];
        const special: Omit<typeof s.orderItems.$inferInsert, "orderId" | "lineNo">[] = [];
        if (kiloOrder) {
          const grams = int(30, 120) * 100;
          const kt = weighted(kiloTypes, (k) => (k.sortOrder === 0 ? 60 : 15));
          if (c.kilo && c.balance < grams) dayTotal += sellForfait(c, new Date(when.getTime() - int(2, 4) * 60_000));
          const description = chance(0.5) ? pick(KILO_DESCRIPTIONS) : null;
          if (c.kilo) {
            c.balance -= grams;
            special.push({ kind: "KILO", kiloTypeId: kt.id, weightGrams: grams, itemLabel: kt.name, serviceLabel: "Forfait", unitPrice: 0, quantity: 1, lineTotal: 0, description });
            moves.push({ customerId: c.id, orderId: id, kind: "CONSO", grams: -grams, label: `${kt.name} (${(grams / 1000).toLocaleString("fr-FR")} kg)`, createdBy: "", createdAt: when });
          } else {
            const price = Math.ceil((grams / 1000) * kt.pricePerKg / 100) * 100;
            special.push({ kind: "KILO", kiloTypeId: kt.id, weightGrams: grams, itemLabel: kt.name, serviceLabel: `${kt.pricePerKg.toLocaleString("fr-FR")}/kg`, unitPrice: price, quantity: 1, lineTotal: price, description });
          }
        } else {
          const nLines = weighted([1, 2, 3, 4, 5], (k) => [30, 32, 22, 11, 5][k - 1]);
          const chosen = new Set<string>();
          for (let l = 0; l < nLines; l++) {
            const it = weighted(items, (x) => ITEM_WEIGHT[x] ?? 1);
            const options = catalog.filter((p) => p.item === it);
            const opt = weighted(options, (p) => (p.service === "Lav+Rep" ? 60 : p.service === "Rep" ? 25 : 15));
            const k = `${opt.itemTypeId}|${opt.serviceId}`;
            if (chosen.has(k)) continue;
            chosen.add(k);
            const qty = MANY.has(it) ? weighted([1, 2, 3, 4, 5, 6], (q) => [30, 30, 18, 12, 6, 4][q - 1]) : weighted([1, 2, 3], (q) => [70, 22, 8][q - 1]);
            // Prix variable : choisi au comptoir selon l'article (pas de 500, le plus souvent dans le bas de la fourchette).
            const price = opt.maxAmount ? Math.min(opt.maxAmount, opt.amount + 500 * weighted([0, 1, 2, 3], (x) => [50, 30, 15, 5][x])) : opt.amount;
            lines.push({ cat: opt, qty, price, description: chance(0.3) ? pick(DESCRIPTIONS) : null });
          }
        }
        const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0) + special.reduce((a, l) => a + (l.lineTotal as number), 0);
        const isExpress = !kiloOrder && chance(0.09);
        const expressAmount = isExpress ? Math.ceil((subtotal * 0.5) / 100) * 100 : 0; // comme computeOrderTotals
        // Geste commercial pour les fidèles : remise ronde de 500 ou 1 000 FCFA.
        const discountAmount = c.regular && c.visits > 6 && subtotal >= 4000 && chance(0.12) ? (subtotal >= 10_000 ? 1000 : 500) : 0;
        const total = subtotal + expressAmount - discountAmount;

        // Cycle de vie
        const dueAt = addH(when, isExpress ? 24 : 48);
        const startedAt = shopHours(addH(when, 1 + rnd() * 8));
        // Charge de travail visible à l'ouverture de l'appli : les dépôts des derniers jours sont plus souvent
        // en retard ou pas encore retirés (écrans « À traiter », « En retard », « Prêtes »).
        const recent = now.getTime() - when.getTime() < 4 * 86_400_000;
        const late = chance(recent ? 0.3 : 0.05);
        // Quelques dépôts d'il y a 3 à 6 jours sont encore à l'atelier : ils apparaissent « En retard ».
        const ageDays = (now.getTime() - when.getTime()) / 86_400_000;
        const backlog = ageDays > 3 && ageDays < 6 && chance(0.3);
        const readyAt = backlog ? addH(now, 6 + rnd() * 40)
          : shopHours(late ? addH(dueAt, 4 + rnd() * 30) : addH(dueAt, -(1 + rnd() * 10)));
        const abandoned = chance(0.009);
        const cancelled = !abandoned && !kiloOrder && chance(0.008);
        const pickupDelayDays = recent && chance(0.5) ? 2 + rnd() * 6 : c.regular ? 0.2 + rnd() * rnd() * 9 : 0.5 + rnd() * 14;
        const collectedAt = shopHours(addH(readyAt, pickupDelayDays * 24));
        // Un forfait se règle entièrement à l'achat.
        const deposit = cancelled ? 0 : chance(0.36) ? total : chance(0.45) ? Math.min(total, Math.round((total * (0.3 + rnd() * 0.4)) / 500) * 500) : 0;
        const agent = worker(when);
        for (let m = moves.length - 1; m >= 0 && moves[m].orderId === id; m--) moves[m].createdBy = agent.id;
        let status: s.OrderStatus = "DEPOSEE";
        let amountPaid = 0;

        history.push({ orderId: id, fromStatus: null, toStatus: "DEPOSEE", changedBy: agent.id, changedAt: when });
        if (deposit > 0) { addPayment(id, deposit, addH(when, 0.01)); amountPaid += deposit; }
        if (cancelled) {
          const t = shopHours(addH(when, 2 + rnd() * 20));
          if (t <= now) {
            status = "ANNULEE";
            history.push({ orderId: id, fromStatus: "DEPOSEE", toStatus: "ANNULEE", changedBy: admin.id, changedAt: t, reason: pick(["Client a repris ses vêtements avant traitement", "Doublon de saisie", "Article refusé : tissu trop fragile"]) });
          }
        } else {
          if (startedAt <= now) { status = "EN_TRAITEMENT"; history.push({ orderId: id, fromStatus: "DEPOSEE", toStatus: "EN_TRAITEMENT", changedBy: worker(startedAt).id, changedAt: startedAt }); }
          if (readyAt <= now) { status = "PRETE"; history.push({ orderId: id, fromStatus: "EN_TRAITEMENT", toStatus: "PRETE", changedBy: worker(readyAt).id, changedAt: readyAt }); }
          if (!abandoned && collectedAt <= now && status === "PRETE") {
            if (amountPaid < total) { addPayment(id, total - amountPaid, collectedAt); amountPaid = total; }
            status = "RETIREE";
            history.push({ orderId: id, fromStatus: "PRETE", toStatus: "RETIREE", changedBy: worker(collectedAt).id, changedAt: addH(collectedAt, 0.02) });
          }
        }
        number++;
        orders.push({
          id, number, customerId: c.id, status, isExpress, expressRatePct: isExpress ? 50 : 0, subtotal, expressAmount,
          discountType: discountAmount ? "MONTANT" : null, discountValue: discountAmount, discountAmount, total, amountPaid, dueAt,
          notes: chance(0.04) ? pick(["Repassage sans pli", "Ne pas amidonner", "Client passera samedi", "Livraison souhaitée"]) : null,
          idempotencyKey: randomUUID(), createdBy: agent.id, createdAt: when, updatedAt: when,
          readyAt: status === "PRETE" || status === "RETIREE" ? readyAt : null,
          collectedAt: status === "RETIREE" ? addH(collectedAt, 0.02) : null, collectedBy: status === "RETIREE" ? agent.id : null,
          cancelledAt: status === "ANNULEE" ? history[history.length - 1].changedAt : null, cancelledBy: status === "ANNULEE" ? admin.id : null,
          cancelReason: status === "ANNULEE" ? history[history.length - 1].reason : null,
        });
        special.forEach((l, i) => itemsRows.push({ ...l, orderId: id, lineNo: i + 1 }));
        lines.forEach((l, i) => itemsRows.push({
          orderId: id, lineNo: i + 1, itemTypeId: l.cat.itemTypeId, serviceId: l.cat.serviceId, itemLabel: l.cat.item, serviceLabel: l.cat.service,
          unitPrice: l.price, quantity: l.qty, lineTotal: l.price * l.qty, description: l.description,
          color: chance(0.55) ? pick(COLORS) : null, brand: chance(0.25) ? pick(BRANDS) : null, observations: chance(0.12) ? pick(OBS) : null,
        }));
        dayTotal += total;
        // Parfois, le client au forfait rachète un forfait d'avance en repartant (solde presque épuisé).
        if (kiloOrder && c.kilo && c.balance < 5000 && chance(0.25)) dayTotal += sellForfait(c, new Date(when.getTime() + int(3, 6) * 60_000));
        dayOrders.push({ when });
      }
      monthAccum += dayTotal;
    }
  };
  // Calage mois par mois : le CA encaissé d'un mois = retraits des dépôts antérieurs (déjà connus) + encaissements
  // des dépôts du mois. On rejoue le mois en ajustant le volume de dépôts jusqu'à tomber sur l'objectif.
  for (const mo of months) {
    const snap = { cust: custs.map((c) => [c.visits, c.lastAt, c.firstAt, c.balance] as const), o: orders.length, i: itemsRows.length, h: history.length, p: pays.length, m: moves.length, n: number };
    const restore = () => {
      custs.forEach((c, j) => { [c.visits, c.lastAt, c.firstAt, c.balance] = snap.cust[j]; });
      orders.length = snap.o; itemsRows.length = snap.i; history.length = snap.h; pays.length = snap.p; moves.length = snap.m; number = snap.n;
    };
    const cashIn = () => pays.reduce((a, p) => (monthKey(p.at) === mo.key ? a + (p.amount as number) : a), 0);
    let T = mo.target, best = { T, err: Infinity };
    for (let pass = 0; pass < 30; pass++) {
      if (pass) restore();
      genMonth(mo, T);
      const got = cashIn();
      const err = Math.abs(got / mo.target - 1);
      if (err < best.err) best = { T, err };
      if (err < 0.003) break;
      T = roundTo(T * (1 + 0.7 * (mo.target / Math.max(1, got) - 1)) + (pass > 10 ? (rnd() - 0.5) * 6_000 : 0), 500);
    }
    if (T !== best.T) { restore(); genMonth(mo, best.T); }
  }
  for (const p of [...pays].sort((a, b) => a.at.getTime() - b.at.getTime())) p.cashSessionId = sessionFor(p.createdBy as string, p.at).id;
  orders.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  const renumber = new Map(orders.map((o, i) => [o.id, i + 1]));
  orders.forEach((o) => (o.number = renumber.get(o.id)!));

  // Dépenses et clôtures
  const exps: (typeof s.expenses.$inferInsert)[] = [];
  const counts: (typeof s.cashSessionCounts.$inferInsert)[] = [];
  const sessionRows: (typeof s.cashSessions.$inferInsert)[] = [];
  const cashSpent = new Map<string, { intrants: number; other: number }>();
  for (const ss of [...sessions.values()].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())) {
    const mk = monthKey(ss.openedAt);
    const b = budgets.get(mk)!;
    const spent = cashSpent.get(mk) ?? { intrants: 0, other: 0 };
    cashSpent.set(mk, spent);
    const nExp = weighted([0, 1, 2], (k) => [62, 30, 8][k]);
    for (let i = 0; i < nExp; i++) {
      const isIntrant = chance(0.6);
      const [label, amount] = isIntrant ? pick(CASH_INTRANTS) : pick(CASH_OTHER);
      // Reste dans la part du budget mensuel réglée à la caisse.
      if (isIntrant ? spent.intrants + amount > b.cashIntrants : spent.other + amount > b.cashOther) continue;
      const when = addH(ss.openedAt, 1 + rnd() * 9);
      if (when > now) continue;
      if (isIntrant) spent.intrants += amount; else spent.other += amount;
      exps.push({ cashSessionId: ss.id, label, category: isIntrant ? "Intrants" : "Autre", method: chance(0.85) ? "ESPECES" : "MTN_MOMO", amount, createdBy: ss.userId, createdAt: when });
    }
    let comment: string | null = null;
    if (ss.closedAt) {
      const gap = chance(0.06) ? pick([-1000, -500, 500, -2000]) : 0;
      for (const m of ["ESPECES", "MTN_MOMO", "ORANGE_MONEY"] as const) {
        const received = pays.filter((p) => p.cashSessionId === ss.id && p.method === m).reduce((a, p) => a + p.amount, 0);
        const spent = exps.filter((e) => e.cashSessionId === ss.id && e.method === m).reduce((a, e) => a + (e.amount as number), 0);
        const expected = (m === "ESPECES" ? ss.float : 0) + received - spent;
        const difference = m === "ESPECES" ? gap : 0;
        counts.push({ cashSessionId: ss.id, method: m, expected, counted: expected + difference, difference });
      }
      if (gap) comment = gap < 0 ? pick(["Monnaie rendue en trop à un client", "Erreur de rendu de monnaie", "Pièce manquante au comptage"]) : "Excédent : pourboire client laissé en caisse";
    }
    sessionRows.push({ id: ss.id, userId: ss.userId, status: ss.closedAt ? "FERMEE" : "OUVERTE", openingFloat: ss.float, openedAt: ss.openedAt, closedAt: ss.closedAt, closingComment: comment });
  }

  // CA encaissé par mois (bilan).
  const byMonth = new Map<string, number>();
  for (const p of pays) byMonth.set(monthKey(p.at), (byMonth.get(monthKey(p.at)) ?? 0) + (p.amount as number));

  // Sorties d'argent du gérant : loyer, eau, électricité, TV, intrants, autres, salaires des agents.
  const outRows: (typeof s.outflows.$inferInsert)[] = [];
  for (const mo of months) {
    const days = mo.openDays;
    if (!days.length) continue;
    const b = budgets.get(mo.key)!;
    const cash = cashSpent.get(mo.key) ?? { intrants: 0, other: 0 };
    const lastDay = days[days.length - 1];
    const isComplete = full.includes(mo);
    const rows: (typeof s.outflows.$inferInsert)[] = [];
    const out = (d: number, category: s.OutflowCategory, label: string, amount: number, method: s.OutflowMethod, beneficiary: string | null = null, extra: Partial<typeof s.outflows.$inferInsert> = {}) => {
      if (d > lastDay || amount <= 0) return;
      const when = at(mo.y, mo.m, Math.min(d, mo.days), int(9, 17), int(0, 59));
      if (when <= now) rows.push({ occurredAt: when, category, label, amount, method, beneficiary, createdBy: admin.id, createdAt: when, ...extra });
    };
    // Intrants : le gros achat du mois au grossiste complète les achats faits à la caisse.
    const bigIntrants = b.intrants - cash.intrants;
    out(3, "INTRANTS", pick(["Lessive (carton), Javel et détachant", "Lessive (carton), amidon et cintres", "Produits de lavage et housses"]), bigIntrants, "ESPECES", "Grossiste Marché Central");
    if (rentOf(mo)) {
      const q = months.slice(months.indexOf(mo), months.indexOf(mo) + RENT_EVERY).map((x) => x.key);
      const ml = (k: string) => `${["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."][Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;
      out(5, "LOYER", `Loyer du trimestre (${ml(q[0])} → ${ml(q[q.length - 1])})`, rentOf(mo), "ORANGE_MONEY", "M. Ndoumbe (bailleur)");
    }
    out(8, "ABONNEMENTS", "Abonnement TV Canal+", TV, "MTN_MOMO", "Canal+");
    if (isComplete) {
      // Factures du mois réglées en fin de mois (le mois en cours ne les a pas encore payées).
      out(lastDay - 2, "ELECTRICITE", "Facture ENEO (électricité)", b.electricity, "MTN_MOMO", "ENEO");
      out(lastDay - 1, "EAU", "Facture CAMWATER (eau)", WATER, "MTN_MOMO", "CAMWATER");
    }
    if (isComplete) {
      out(20, "AUTRE", pick(["Réparation fer à repasser", "Recharge gaz et divers", "Fournitures et petit matériel", "Réparation machine à laver"]), Math.max(500, b.other - cash.other), "ESPECES", pick(["Technicien Akwa", "Quincaillerie Ndokoti", null]));
      agents.forEach((a, i) => out(lastDay, "SALAIRES", `Salaire ${a.name}`, SALARIES[i], "MTN_MOMO", a.name, { beneficiaryUserId: a.id, salaryPeriod: mo.key }));
    } else {
      out(20, "AUTRE", "Fournitures et petit matériel", Math.max(500, b.other - cash.other), "ESPECES", "Quincaillerie Ndokoti");
    }
    outRows.push(...rows);
  }

  // Écriture
  const used = custs.filter((c) => c.visits > 0);
  const chunk = async <T,>(rows: T[], f: (b: T[]) => Promise<unknown>, size = 400) => { for (let i = 0; i < rows.length; i += size) await f(rows.slice(i, i + size)); };
  await chunk(used.map((c) => ({
    id: c.id, fullName: c.fullName, searchName: normalizeName(c.fullName), phone: c.phone, phoneNormalized: normalizePhone(c.phone),
    address: c.address, notes: null, createdAt: c.firstAt!, updatedAt: c.lastAt!,
  })), (b) => db.insert(s.customers).values(b));
  await chunk(sessionRows, (b) => db.insert(s.cashSessions).values(b));
  await chunk(orders, (b) => db.insert(s.orders).values(b));
  await chunk(itemsRows, (b) => db.insert(s.orderItems).values(b));
  await chunk(history, (b) => db.insert(s.orderStatusHistory).values(b));
  await chunk(moves, (b) => db.insert(s.forfaitMoves).values(b));
  await chunk(pays.map((p) => { const { at, ...row } = p; void at; return row; }), (b) => db.insert(s.payments).values(b));
  await chunk(exps, (b) => db.insert(s.expenses).values(b));
  await chunk(counts, (b) => db.insert(s.cashSessionCounts).values(b));
  await chunk(outRows, (b) => db.insert(s.outflows).values(b));
  await db.insert(s.appMeta).values({ key: "demo_version", value: DEMO_VERSION })
    .onConflictDoUpdate({ target: s.appMeta.key, set: { value: DEMO_VERSION, updatedAt: new Date() } });
  await db.execute(sql`SELECT setval('order_number_seq', (SELECT coalesce(max(number), 0) + 1 FROM orders), false)`);

  // Bilan
  const regularCount = used.filter((c) => c.regular).length;
  console.log(`\nClients : ${used.length} (${regularCount} habitués, soit ${Math.round((regularCount / used.length) * 100)} %)`);
  console.log(`Commandes : ${orders.length} · lignes : ${itemsRows.length} · paiements : ${pays.length} · sessions de caisse : ${sessionRows.length} · dépenses : ${exps.length}`);
  console.log("\nCA encaissé par mois (FCFA) :");
  const fullKeys = full.map((m) => m.key);
  for (const mo of months) console.log(`  ${mo.key}  ${String(byMonth.get(mo.key) ?? 0).padStart(9)}${fullKeys.includes(mo.key) ? "" : "  (mois en cours)"}`);
  const fullVals = fullKeys.map((k) => byMonth.get(k) ?? 0);
  const outByMonth = new Map<string, number>();
  for (const o of outRows) outByMonth.set(monthKey(o.occurredAt as Date), (outByMonth.get(monthKey(o.occurredAt as Date)) ?? 0) + (o.amount as number));
  for (const e of exps) outByMonth.set(monthKey(e.createdAt as Date), (outByMonth.get(monthKey(e.createdAt as Date)) ?? 0) + (e.amount as number));
  console.log("\nDépenses (sorties + caisse) et bénéfice par mois :");
  for (const mo of months) console.log(`  ${mo.key}  dépenses ${String(outByMonth.get(mo.key) ?? 0).padStart(8)}  bénéfice ${String((byMonth.get(mo.key) ?? 0) - (outByMonth.get(mo.key) ?? 0)).padStart(8)}`);
  const profits = fullKeys.map((k) => (byMonth.get(k) ?? 0) - (outByMonth.get(k) ?? 0));
  const sorted = [...fullVals].sort((a, b) => a - b);
  console.log(`  CA des mois complets : min ${sorted[0]} · médiane ${sorted[Math.floor(sorted.length / 2)]} · max ${sorted[sorted.length - 1]} · moyenne ${Math.round(mean(fullVals))}`);
  console.log(`  Bénéfice des mois complets : moyenne ${Math.round(mean(profits))} (cible ${PROFIT_AVG}) · min ${Math.min(...profits)} · max ${Math.max(...profits)}`);
  const odd = [...orders.map((o) => o.total as number), ...pays.map((p) => p.amount as number), ...exps.map((e) => e.amount as number), ...outRows.map((o) => o.amount as number)].filter((v) => v % 100 !== 0).length;
  const by500 = [...pays.map((p) => p.amount as number), ...exps.map((e) => e.amount as number), ...outRows.map((o) => o.amount as number)];
  console.log(`  Montants non multiples de 100 : ${odd} · paiements et dépenses multiples de 500 : ${Math.round((by500.filter((v) => v % 500 === 0).length / by500.length) * 100)} %`);
  console.log(`\nComptes de démo : gérant « ${admin.username} », agents « paul » et « brigitte » (mot de passe : DEMO_AGENT_PASSWORD${process.env.DEMO_AGENT_PASSWORD ? "" : ", défaut agent123"}).`);
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
