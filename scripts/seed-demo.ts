/**
 * Jeu de données de démonstration réaliste (à lancer après `pnpm db:seed`).
 *
 *  - Période : de DEMO_START (défaut 2025-11-01) à aujourd'hui.
 *  - CA encaissé : entre 400 000 et 700 000 FCFA par mois complet, moyenne ≈ 580 000.
 *  - Clients aux noms camerounais ; 70 % sont des habitués qui reviennent régulièrement.
 *  - Deux agents comptoir, une session de caisse par agent et par jour, dépenses, clôtures.
 *
 *   pnpm db:seed-demo                 # refuse si des commandes existent déjà
 *   DEMO_RESET=1 pnpm db:seed-demo    # efface les données métier puis régénère
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
const MIN = 400_000, MAX = 700_000, MEAN = 580_000;
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
const EXPENSES = [["Lessive (sac 5 kg)", "Intrants", 4500], ["Eau de Javel", "Intrants", 1500], ["Transport livraison", "Transport", 1000], ["Cintres et housses", "Intrants", 2500], ["Électricité (recharge)", "Énergie", 5000], ["Sachets plastiques", "Intrants", 1500], ["Détachant", "Intrants", 3000], ["Moto-taxi courses", "Transport", 500]] as const;
const ITEM_WEIGHT: Record<string, number> = { "Chemise": 30, "Pantalon": 24, "Tee-shirt": 10, "Robe": 9, "Jupe": 6, "Costume (2 pièces)": 6, "Veste": 5, "Boubou": 6, "Kaba": 4, "Pull": 3, "Manteau": 1, "Cravate": 2, "Drap": 6, "Couette": 2, "Rideau": 2 };

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

async function main() {
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

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.orders);
  if (n > 0 && process.env.DEMO_RESET !== "1") throw new Error(`${n} commandes existent déjà. Relancez avec DEMO_RESET=1 pour tout effacer et régénérer.`);
  if (process.env.DEMO_RESET === "1") {
    await db.execute(sql`TRUNCATE outflows, cash_session_counts, expenses, payments, order_status_history, order_items, orders, cash_sessions, customers RESTART IDENTITY CASCADE`);
    await db.execute(sql`ALTER SEQUENCE order_number_seq RESTART WITH 1`);
    console.log("Données métier effacées.");
  }

  // Catalogue et gérant (créés par `pnpm db:seed`)
  const [admin] = await db.select().from(s.user).where(eq(s.user.role, "ADMIN")).limit(1);
  if (!admin) throw new Error("Aucun gérant : lancez d'abord `pnpm db:seed`.");
  const catalog = await db.select({
    itemTypeId: s.prices.itemTypeId, serviceId: s.prices.serviceId, amount: s.prices.amount, item: s.itemTypes.name, service: s.services.shortName,
  }).from(s.prices).innerJoin(s.itemTypes, eq(s.itemTypes.id, s.prices.itemTypeId)).innerJoin(s.services, eq(s.services.id, s.prices.serviceId))
    .where(and(eq(s.prices.active, true), eq(s.itemTypes.active, true), eq(s.services.active, true)));
  if (!catalog.length) throw new Error("Catalogue vide : lancez d'abord `pnpm db:seed`.");
  const items = [...new Set(catalog.map((c) => c.item))];

  await db.update(s.settings).set({ shopName: "Continental Pressing", address: "Logpom, Douala" })
    .where(and(eq(s.settings.id, 1), eq(s.settings.address, "Douala")));

  // Agents comptoir
  const agentPassword = process.env.DEMO_AGENT_PASSWORD ?? "agent123";
  const agents: { id: string; name: string }[] = [];
  for (const [username, name] of [["paul", "Paul Essomba"], ["brigitte", "Brigitte Ngo Bassong"]]) {
    const [existing] = await db.select().from(s.user).where(eq(s.user.username, username)).limit(1);
    if (existing) { agents.push({ id: existing.id, name: existing.name }); continue; }
    const id = randomUUID();
    await db.insert(s.user).values({ id, name, email: `${username}@pressing.local`, emailVerified: true, username, displayUsername: username, role: "AGENT", createdAt: at(2025, 9, 25, 9, 0) });
    await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(agentPassword) });
    agents.push({ id, name });
  }
  const staff = [...agents, { id: admin.id, name: admin.name }];

  // Période
  const now = new Date();
  const [sy, sm] = START.split("-").map(Number);
  const startDate = at(sy, sm - 1, 1, 0, 0);
  const months: { key: string; y: number; m: number; days: number; openDays: number[]; target: number }[] = [];
  for (let y = sy, m = sm - 1; at(y, m, 1, 0, 0) <= now; m === 11 ? (y++, m = 0) : m++) {
    const days = new TZDate(y, m + 1, 0, 12, 0, 0, TZ).getDate();
    const openDays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => at(y, m, d, 12, 0).getTime() <= now.getTime() && local(at(y, m, d, 12, 0)).getDay() !== 0);
    months.push({ key: `${y}-${String(m + 1).padStart(2, "0")}`, y, m, days, openDays, target: 0 });
  }
  // Objectifs mensuels : tirés dans [MIN, MAX], recentrés sur MEAN, saisonnalité (fêtes de fin d'année, rentrée).
  const SEASON: Record<number, number> = { 11: 1.12, 0: 0.9, 7: 0.93, 8: 1.06, 3: 1.04 };
  const full = months.filter((mo) => mo.openDays.length >= 20 || mo.openDays.includes(mo.days) || mo.openDays.includes(mo.days - 1));
  let raw = full.map((mo) => (MEAN + (rnd() - 0.5) * 220_000) * (SEASON[mo.m] ?? 1));
  for (let k = 0; k < 20; k++) {
    const shift = MEAN - raw.reduce((a, b) => a + b, 0) / raw.length;
    raw = raw.map((v) => Math.min(MAX - 45_000, Math.max(MIN + 45_000, v + shift)));
  }
  // Légère compensation : une partie des dépôts de fin de mois est encaissée le mois suivant ou reste impayée.
  full.forEach((mo, i) => (mo.target = Math.round((raw[i] * 1.016) / 1000) * 1000));
  for (const mo of months) if (!mo.target) {
    // Mois en cours : objectif proratisé sur les jours ouvrés écoulés.
    const totalOpen = Array.from({ length: mo.days }, (_, i) => i + 1).filter((d) => local(at(mo.y, mo.m, d, 12, 0)).getDay() !== 0).length;
    mo.target = Math.round((MEAN * mo.openDays.length) / totalOpen / 1000) * 1000;
  }

  // Clients : 70 % d'habitués
  type Cust = { id: string; fullName: string; phone: string; regular: boolean; repeat: boolean; rate: number; joinAt: Date; visits: number; lastAt: Date | null; address: string | null; firstAt: Date | null };
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
      rate: regular ? 1 / int(9, 30) : 0, repeat: chance(0.3), joinAt, visits: 0, lastAt: null, firstAt: null,
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
  const sessions = new Map<string, { id: string; userId: string; day: string; openedAt: Date; closedAt: Date | null; float: number }>();
  const sessionFor = (userId: string, when: Date) => {
    const k = `${userId}|${dayKey(when)}`;
    let ss = sessions.get(k);
    if (!ss) {
      const z = local(when);
      const openedAt = at(z.getFullYear(), z.getMonth(), z.getDate(), 7, int(25, 50));
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
    pays.push({ id: randomUUID(), orderId, cashSessionId: sessionFor(w.id, when).id, method: m, amount, reference: m === "ESPECES" ? null : (chance(0.7) ? `${m === "MTN_MOMO" ? "MP" : "OM"}${int(100000000, 999999999)}` : null), idempotencyKey: randomUUID(), createdBy: w.id, createdAt: when, at: when });
  };

  let number = 0;
  const monthAccum = new Map<string, number>();
  for (const mo of months) {
    for (let di = 0; di < mo.openDays.length; di++) {
      const d = mo.openDays[di];
      const remainingDays = mo.openDays.length - di;
      const dayBudget = (mo.target - (monthAccum.get(mo.key) ?? 0)) / remainingDays * (0.75 + rnd() * 0.5);
      let dayTotal = 0;
      const dayOrders: { when: Date }[] = [];
      while (dayTotal < dayBudget) {
        const when = at(mo.y, mo.m, d, int(7, 18), int(0, 59));
        if (when > now) break;
        // Choix du client : habitués pondérés par fréquence, occasionnels ~6 % des dépôts.
        let c: Cust | undefined;
        if (chance(0.075)) c = occasionalQueue.find((o) => o.joinAt <= when && (o.visits === 0 || (o.visits === 1 && o.repeat && when.getTime() - o.lastAt!.getTime() > 25 * 86_400_000)));
        if (!c) {
          const eligible = custs.filter((x) => x.regular && x.joinAt <= when && (!x.lastAt || when.getTime() - x.lastAt.getTime() > 4 * 86_400_000));
          c = weighted(eligible, (x) => x.rate * (x.lastAt ? Math.min(3, (when.getTime() - x.lastAt.getTime()) / 86_400_000 * x.rate) : 1.5));
        }
        c.visits++; c.lastAt = when; c.firstAt ??= when;

        // Articles
        const nLines = weighted([1, 2, 3, 4, 5], (k) => [30, 32, 22, 11, 5][k - 1]);
        const chosen = new Set<string>();
        const lines: { cat: (typeof catalog)[number]; qty: number }[] = [];
        for (let l = 0; l < nLines; l++) {
          const it = weighted(items, (x) => ITEM_WEIGHT[x] ?? 1);
          const options = catalog.filter((p) => p.item === it);
          const opt = weighted(options, (p) => (p.service === "Lav+Rep" ? 60 : p.service === "Rep" ? 25 : 15));
          const k = `${opt.itemTypeId}|${opt.serviceId}`;
          if (chosen.has(k)) continue;
          chosen.add(k);
          const qty = it === "Chemise" || it === "Pantalon" || it === "Tee-shirt" ? weighted([1, 2, 3, 4, 5, 6], (q) => [30, 30, 18, 12, 6, 4][q - 1]) : weighted([1, 2, 3], (q) => [70, 22, 8][q - 1]);
          lines.push({ cat: opt, qty });
        }
        const subtotal = lines.reduce((a, l) => a + l.cat.amount * l.qty, 0);
        const isExpress = chance(0.09);
        const expressAmount = isExpress ? Math.round(subtotal * 0.5) : 0;
        const discountPct = c.regular && c.visits > 6 && chance(0.12) ? 5 : 0;
        const discountAmount = Math.round(((subtotal + expressAmount) * discountPct) / 100);
        const total = subtotal + expressAmount - discountAmount;

        // Cycle de vie
        const id = randomUUID();
        const dueAt = addH(when, isExpress ? 24 : 48);
        const startedAt = shopHours(addH(when, 1 + rnd() * 8));
        const late = chance(0.05);
        const readyAt = shopHours(late ? addH(dueAt, 4 + rnd() * 30) : addH(dueAt, -(1 + rnd() * 10)));
        const abandoned = chance(0.009);
        const cancelled = !abandoned && chance(0.008);
        const pickupDelayDays = c.regular ? 0.2 + rnd() * rnd() * 9 : 0.5 + rnd() * 14;
        const collectedAt = shopHours(addH(readyAt, pickupDelayDays * 24));
        const deposit = cancelled ? 0 : chance(0.36) ? total : chance(0.45) ? Math.min(total, Math.round((total * (0.3 + rnd() * 0.4)) / 500) * 500) : 0;
        const agent = worker(when);
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
          discountType: discountPct ? "POURCENT" : null, discountValue: discountPct, discountAmount, total, amountPaid, dueAt,
          notes: chance(0.04) ? pick(["Repassage sans pli", "Ne pas amidonner", "Client passera samedi", "Livraison souhaitée"]) : null,
          idempotencyKey: randomUUID(), createdBy: agent.id, createdAt: when, updatedAt: when,
          readyAt: status === "PRETE" || status === "RETIREE" ? readyAt : null,
          collectedAt: status === "RETIREE" ? addH(collectedAt, 0.02) : null, collectedBy: status === "RETIREE" ? agent.id : null,
          cancelledAt: status === "ANNULEE" ? history[history.length - 1].changedAt : null, cancelledBy: status === "ANNULEE" ? admin.id : null,
          cancelReason: status === "ANNULEE" ? history[history.length - 1].reason : null,
        });
        lines.forEach((l, i) => itemsRows.push({
          orderId: id, lineNo: i + 1, itemTypeId: l.cat.itemTypeId, serviceId: l.cat.serviceId, itemLabel: l.cat.item, serviceLabel: l.cat.service,
          unitPrice: l.cat.amount, quantity: l.qty, lineTotal: l.cat.amount * l.qty,
          color: chance(0.55) ? pick(COLORS) : null, brand: chance(0.25) ? pick(BRANDS) : null, observations: chance(0.12) ? pick(OBS) : null,
        }));
        dayTotal += total;
        dayOrders.push({ when });
      }
      monthAccum.set(mo.key, (monthAccum.get(mo.key) ?? 0) + dayTotal);
    }
  }
  orders.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  const renumber = new Map(orders.map((o, i) => [o.id, i + 1]));
  orders.forEach((o) => (o.number = renumber.get(o.id)!));

  // Dépenses et clôtures
  const exps: (typeof s.expenses.$inferInsert)[] = [];
  const counts: (typeof s.cashSessionCounts.$inferInsert)[] = [];
  const sessionRows: (typeof s.cashSessions.$inferInsert)[] = [];
  for (const ss of sessions.values()) {
    const nExp = weighted([0, 1, 2], (k) => [55, 35, 10][k]);
    for (let i = 0; i < nExp; i++) {
      const [label, category, amount] = pick(EXPENSES);
      const when = addH(ss.openedAt, 1 + rnd() * 9);
      if (when > now) continue;
      exps.push({ cashSessionId: ss.id, label, category, method: chance(0.85) ? "ESPECES" : "MTN_MOMO", amount, createdBy: ss.userId, createdAt: when });
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

  // Sorties d'argent du gérant : salaires, loyer, factures, achats d'intrants, entretien, taxes.
  const outRows: (typeof s.outflows.$inferInsert)[] = [];
  const STAFF_PAY: [string, number][] = [[agents[0].name, 55_000], [agents[1].name, 55_000], ["Mbarga Hervé (repasseur)", 50_000], ["Onana Cécile (lavandière)", 45_000]];
  for (const mo of months) {
    const days = mo.openDays;
    if (!days.length) continue;
    const dayAt = (d: number, h = 10) => at(mo.y, mo.m, d, h, int(0, 59));
    const out = (d: number, category: s.OutflowCategory, label: string, amount: number, method: s.OutflowMethod, beneficiary: string | null = null, salaryPeriod: string | null = null) => {
      const when = dayAt(d, int(9, 17));
      if (when <= now) outRows.push({ occurredAt: when, category, label, amount, method, beneficiary, salaryPeriod, createdBy: admin.id, createdAt: when });
    };
    const lastDay = days[days.length - 1];
    const isComplete = days.length >= 24;
    out(Math.min(5, lastDay), "LOYER", "Loyer du local", 60_000, "ORANGE_MONEY", "M. Ndoumbe (bailleur)");
    if (lastDay >= 12) out(12, "ENERGIE_EAU", "Facture ENEO (électricité)", Math.round(int(24, 39) * 1000 / 500) * 500, "MTN_MOMO", "ENEO");
    if (lastDay >= 14) out(14, "ENERGIE_EAU", "Facture CAMWATER (eau)", int(8, 14) * 1000, "MTN_MOMO", "CAMWATER");
    if (lastDay >= 3) out(3, "INTRANTS", pick(["Lessive (carton) et eau de Javel", "Lessive, Javel et détachant"]), int(28, 42) * 1000, "ESPECES", "Grossiste Marché Central");
    if (lastDay >= 18) out(18, "INTRANTS", pick(["Cintres, housses et sachets", "Lessive (carton) et amidon", "Détachant et assouplissant"]), int(15, 30) * 1000, "ESPECES", pick(["Grossiste Marché Central", "Quincaillerie Ndokoti"]));
    if (chance(0.3) && lastDay >= 21) out(21, "ENTRETIEN", pick(["Réparation machine à laver", "Réparation fer à repasser", "Remplacement résistance séchoir"]), int(10, 35) * 1000, "ESPECES", "Technicien Akwa");
    if ([0, 3, 6, 9].includes(mo.m) && lastDay >= 15) out(15, "TAXES", "Impôt libératoire (trimestre)", 15_000, "ORANGE_MONEY", "Centre des impôts");
    if (chance(0.25) && lastDay >= 9) out(9, "TRANSPORT", "Transport achats au marché", int(2, 5) * 1000, "ESPECES");
    if (isComplete) {
      const period = mo.key;
      for (const [name, pay] of STAFF_PAY) out(lastDay, "SALAIRES", `Salaire ${name}`, pay, name.includes("(") ? "ESPECES" : "MTN_MOMO", name, period);
    }
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
  await chunk(pays.map((p) => { const { at, ...row } = p; void at; return row; }), (b) => db.insert(s.payments).values(b));
  await chunk(exps, (b) => db.insert(s.expenses).values(b));
  await chunk(counts, (b) => db.insert(s.cashSessionCounts).values(b));
  await chunk(outRows, (b) => db.insert(s.outflows).values(b));
  await db.execute(sql`SELECT setval('order_number_seq', (SELECT coalesce(max(number), 0) + 1 FROM orders), false)`);

  // Bilan
  const byMonth = new Map<string, number>();
  for (const p of pays) byMonth.set(monthKey(p.at), (byMonth.get(monthKey(p.at)) ?? 0) + (p.amount as number));
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
  console.log(`  Moyenne des mois complets : ${Math.round(fullVals.reduce((a, b) => a + b, 0) / fullVals.length)} · min ${Math.min(...fullVals)} · max ${Math.max(...fullVals)}`);
  console.log(`\nComptes de démo : gérant « ${admin.username} », agents « paul » et « brigitte » (mot de passe agents : ${agentPassword}).`);
  await close();
}

main().catch((e) => { console.error(e); process.exit(1); });
