import "server-only";
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { expenses, outflows, payments, user } from "../db/schema";
import { TZDate } from "@date-fns/tz";
import { TZ } from "@/lib/domain/dates";
import { ALL_OUTFLOW_CATEGORIES, expenseToOutflowCategory, type OutflowCategory } from "@/lib/domain/cash";

type Row = { month: string; total: number };
function rows(r: unknown): Row[] {
  const list = (r as { rows?: Row[] }).rows ?? (r as Row[]);
  return list.map((x) => ({ month: x.month, total: Number(x.total) }));
}

export interface MonthFinance { month: string; sales: number; cashExpenses: number; outflows: number; expenses: number; profit: number; salaries: number }

/** Ventes encaissées, dépenses (caisse + sorties) et bénéfice par mois, sur les N derniers mois. */
export async function monthlyFinance(months = 12): Promise<MonthFinance[]> {
  const since = sql`(date_trunc('month', now() at time zone ${TZ}) - make_interval(months => ${months - 1})) at time zone ${TZ}`;
  const [sales, cash, out, sal] = await Promise.all([
    db.execute(sql`select to_char(${payments.createdAt} at time zone ${TZ}, 'YYYY-MM') as month, sum(${payments.amount})::int as total
      from ${payments} where ${payments.voidedAt} is null and ${payments.createdAt} >= ${since} group by 1`),
    db.execute(sql`select to_char(${expenses.createdAt} at time zone ${TZ}, 'YYYY-MM') as month, sum(${expenses.amount})::int as total
      from ${expenses} where ${expenses.voidedAt} is null and ${expenses.createdAt} >= ${since} group by 1`),
    db.execute(sql`select to_char(${outflows.occurredAt} at time zone ${TZ}, 'YYYY-MM') as month, sum(${outflows.amount})::int as total
      from ${outflows} where ${outflows.voidedAt} is null and ${outflows.occurredAt} >= ${since} group by 1`),
    db.execute(sql`select to_char(${outflows.occurredAt} at time zone ${TZ}, 'YYYY-MM') as month, sum(${outflows.amount})::int as total
      from ${outflows} where ${outflows.voidedAt} is null and ${outflows.category} = 'SALAIRES' and ${outflows.occurredAt} >= ${since} group by 1`),
  ]);
  const m = (r: unknown) => new Map(rows(r).map((x) => [x.month, x.total]));
  const S = m(sales), C = m(cash), O = m(out), W = m(sal);
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
  const [cy, cm] = fmt.format(now).split("-").map(Number);
  const list: MonthFinance[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(cy, cm - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const sales = S.get(key) ?? 0, cashExpenses = C.get(key) ?? 0, outflowsT = O.get(key) ?? 0;
    list.push({ month: key, sales, cashExpenses, outflows: outflowsT, expenses: cashExpenses + outflowsT, profit: sales - cashExpenses - outflowsT, salaries: W.get(key) ?? 0 });
  }
  // On ne garde pas les mois vides du début (avant l'ouverture).
  while (list.length > 1 && list[0].sales === 0 && list[0].expenses === 0) list.shift();
  return list;
}

/** Répartition des dépenses par catégorie sur une période (sorties + dépenses de caisse). */
export async function expensesByCategory(from: Date, to: Date): Promise<{ category: OutflowCategory; total: number }[]> {
  const [o, e] = await Promise.all([
    db.select({ category: outflows.category, total: sql<number>`sum(${outflows.amount})::int` }).from(outflows)
      .where(and(isNull(outflows.voidedAt), gte(outflows.occurredAt, from), lt(outflows.occurredAt, to))).groupBy(outflows.category),
    db.select({ category: expenses.category, total: sql<number>`sum(${expenses.amount})::int` }).from(expenses)
      .where(and(isNull(expenses.voidedAt), gte(expenses.createdAt, from), lt(expenses.createdAt, to))).groupBy(expenses.category),
  ]);
  const map = new Map<OutflowCategory, number>();
  for (const r of o) map.set(r.category, (map.get(r.category) ?? 0) + Number(r.total));
  for (const r of e) { const c = expenseToOutflowCategory(r.category); map.set(c, (map.get(c) ?? 0) + Number(r.total)); }
  return ALL_OUTFLOW_CATEGORIES.map((c) => ({ category: c, total: map.get(c) ?? 0 })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

export async function salesBetween(from: Date, to: Date) {
  const [r] = await db.select({ total: sql<number>`coalesce(sum(${payments.amount}),0)::int` }).from(payments)
    .where(and(isNull(payments.voidedAt), gte(payments.createdAt, from), lt(payments.createdAt, to)));
  return Number(r.total);
}

export type MoneyOut = {
  id: string; source: "SORTIE" | "CAISSE"; at: Date; category: OutflowCategory; label: string; amount: number; method: string;
  beneficiary: string | null; beneficiaryUserId: string | null; salaryPeriod: string | null; notes: string | null; by: string | null; voided: boolean; voidReason: string | null;
};

/** Toutes les sorties d'argent d'une période : sorties du gérant et dépenses de caisse. */
export async function listMoneyOut(from: Date, to: Date): Promise<MoneyOut[]> {
  const [o, e] = await Promise.all([
    db.select({ x: outflows, by: user.name }).from(outflows).leftJoin(user, eq(user.id, outflows.createdBy))
      .where(and(gte(outflows.occurredAt, from), lt(outflows.occurredAt, to))).orderBy(desc(outflows.occurredAt)),
    db.select({ x: expenses, by: user.name }).from(expenses).leftJoin(user, eq(user.id, expenses.createdBy))
      .where(and(gte(expenses.createdAt, from), lt(expenses.createdAt, to))).orderBy(desc(expenses.createdAt)),
  ]);
  return [
    ...o.map(({ x, by }) => ({ id: x.id, source: "SORTIE" as const, at: x.occurredAt, category: x.category, label: x.label, amount: x.amount, method: x.method,
      beneficiary: x.beneficiary, beneficiaryUserId: x.beneficiaryUserId, salaryPeriod: x.salaryPeriod, notes: x.notes, by, voided: !!x.voidedAt, voidReason: x.voidReason })),
    ...e.map(({ x, by }) => ({ id: x.id, source: "CAISSE" as const, at: x.createdAt, category: expenseToOutflowCategory(x.category), label: x.label, amount: x.amount, method: x.method,
      beneficiary: null, beneficiaryUserId: null, salaryPeriod: null, notes: null, by, voided: !!x.voidedAt, voidReason: x.voidReason })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export type SalaryStaff = { id: string; name: string; role: string; monthlySalary: number | null; lastAmount: number | null; lastPeriod: string | null };

/** Employés payables : les comptes utilisateurs actifs, avec leur dernier salaire pour préremplir le montant. */
export async function salaryStaff(): Promise<SalaryStaff[]> {
  const [staff, last] = await Promise.all([
    db.select({ id: user.id, name: user.name, role: user.role, monthlySalary: user.monthlySalary }).from(user).where(sql`coalesce(${user.banned}, false) = false`).orderBy(asc(user.name)),
    db.selectDistinctOn([outflows.beneficiaryUserId], { userId: outflows.beneficiaryUserId, amount: outflows.amount, period: outflows.salaryPeriod }).from(outflows)
      .where(and(eq(outflows.category, "SALAIRES"), isNotNull(outflows.beneficiaryUserId), isNull(outflows.voidedAt)))
      .orderBy(outflows.beneficiaryUserId, desc(outflows.occurredAt)),
  ]);
  const byUser = new Map(last.map((l) => [l.userId!, l]));
  return staff.map((u) => ({ ...u, lastAmount: byUser.get(u.id)?.amount ?? null, lastPeriod: byUser.get(u.id)?.period ?? null }));
}

/** Mois ayant de l'activité (premier paiement ou première sortie → mois courant), du plus récent au plus ancien. */
export async function availableMonths(): Promise<string[]> {
  const [r] = await db.select({
    first: sql<Date | null>`least((select min(${payments.createdAt}) from ${payments}), (select min(${outflows.occurredAt}) from ${outflows}), (select min(${expenses.createdAt}) from ${expenses}))`,
  }).from(sql`(select 1) as one`);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
  const now = fmt.format(new Date());
  const start = r?.first ? fmt.format(new Date(r.first)) : now;
  const list: string[] = [];
  let [y, m] = now.split("-").map(Number);
  for (;;) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    list.push(k);
    if (k <= start || list.length > 120) break;
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return list;
}

/** Bornes d'un mois « YYYY-MM » dans le fuseau de Douala. */
export function monthBounds(key: string): { from: Date; to: Date } {
  const [y, m] = key.split("-").map(Number);
  return { from: new Date(new TZDate(y, m - 1, 1, 0, 0, 0, TZ).getTime()), to: new Date(new TZDate(y, m, 1, 0, 0, 0, TZ).getTime()) };
}
