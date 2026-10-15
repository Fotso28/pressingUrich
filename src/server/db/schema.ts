import {
  pgTable, pgEnum, pgSequence, uuid, text, integer, bigint, boolean,
  timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const orderStatusEnum = pgEnum("order_status",
  ["DEPOSEE", "EN_TRAITEMENT", "PRETE", "RETIREE", "ANNULEE"]);
export const paymentMethodEnum = pgEnum("payment_method",
  ["ESPECES", "MTN_MOMO", "ORANGE_MONEY"]);
export const cashStatusEnum = pgEnum("cash_status", ["OUVERTE", "FERMEE"]);
export const outflowCategoryEnum = pgEnum("outflow_category",
  ["INTRANTS", "SALAIRES", "LOYER", "ENERGIE_EAU", "TRANSPORT", "ENTRETIEN", "TAXES", "AUTRE"]);
export const outflowMethodEnum = pgEnum("outflow_method", ["ESPECES", "MTN_MOMO", "ORANGE_MONEY", "BANQUE"]);
export const discountTypeEnum = pgEnum("discount_type", ["MONTANT", "POURCENT"]);

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1 });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Better Auth (plugins username + admin)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  role: text("role").notNull().default("AGENT"), // ADMIN | AGENT
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ---------------------------------------------------------------------------
// Métier
// ---------------------------------------------------------------------------

export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1), // ligne unique
  shopName: text("shop_name").notNull(),
  address: text("address"),
  phones: text("phones"),
  ticketFooter: text("ticket_footer"),
  standardDelayHours: integer("standard_delay_hours").notNull().default(48),
  expressDelayHours: integer("express_delay_hours").notNull().default(24),
  expressRatePct: integer("express_rate_pct").notNull().default(50),
  abandonedAfterDays: integer("abandoned_after_days").notNull().default(30),
  agentMaxDiscountPct: integer("agent_max_discount_pct").notNull().default(10),
  ...timestamps,
});

export const itemTypes = pgTable("item_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isFrequent: boolean("is_frequent").notNull().default(false), // bouton rapide au dépôt
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  shortName: text("short_name").notNull(), // « Lav+Rep » sur le ticket
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const prices = pgTable("prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemTypeId: uuid("item_type_id").notNull().references(() => itemTypes.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  amount: integer("amount").notNull(), // FCFA
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (t) => [uniqueIndex("prices_item_service_uq").on(t.itemTypeId, t.serviceId)]);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  searchName: text("search_name").notNull(), // minuscules, sans accents
  phone: text("phone").notNull(), // tel que saisi
  phoneNormalized: text("phone_normalized").notNull(), // 9 chiffres
  address: text("address"),
  notes: text("notes"),
  ...timestamps,
}, (t) => [
  index("customers_phone_idx").on(t.phoneNormalized),
  index("customers_search_trgm").using("gin", sql`${t.searchName} gin_trgm_ops`),
  index("customers_phone_trgm").using("gin", sql`${t.phoneNormalized} gin_trgm_ops`),
]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  number: bigint("number", { mode: "number" }).notNull().unique()
    .default(sql`nextval('order_number_seq')`),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  status: orderStatusEnum("status").notNull().default("DEPOSEE"),
  isExpress: boolean("is_express").notNull().default(false),
  expressRatePct: integer("express_rate_pct").notNull().default(0), // figé
  subtotal: integer("subtotal").notNull(),
  expressAmount: integer("express_amount").notNull().default(0),
  discountType: discountTypeEnum("discount_type"),
  discountValue: integer("discount_value").notNull().default(0),
  discountAmount: integer("discount_amount").notNull().default(0),
  total: integer("total").notNull(),
  amountPaid: integer("amount_paid").notNull().default(0), // maintenu en transaction
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  createdBy: text("created_by").notNull(), // user.id
  readyAt: timestamp("ready_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  collectedBy: text("collected_by"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by"),
  cancelReason: text("cancel_reason"),
  ...timestamps,
}, (t) => [
  index("orders_status_due_idx").on(t.status, t.dueAt),
  index("orders_customer_idx").on(t.customerId),
  index("orders_created_idx").on(t.createdAt),
]);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  lineNo: integer("line_no").notNull(), // 1, 2, 3… pour l'étiquette
  itemTypeId: uuid("item_type_id").notNull().references(() => itemTypes.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  itemLabel: text("item_label").notNull(), // copie figée
  serviceLabel: text("service_label").notNull(),
  unitPrice: integer("unit_price").notNull(), // prix figé
  quantity: integer("quantity").notNull(),
  lineTotal: integer("line_total").notNull(),
  color: text("color"),
  brand: text("brand"),
  observations: text("observations"),
}, (t) => [uniqueIndex("order_items_line_uq").on(t.orderId, t.lineNo)]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  fromStatus: orderStatusEnum("from_status"),
  toStatus: orderStatusEnum("to_status").notNull(),
  reason: text("reason"),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("osh_order_idx").on(t.orderId)]);

export const cashSessions = pgTable("cash_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  status: cashStatusEnum("status").notNull().default("OUVERTE"),
  openingFloat: integer("opening_float").notNull().default(0), // espèces
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closingComment: text("closing_comment"),
}, (t) => [
  uniqueIndex("cash_one_open_per_user").on(t.userId).where(sql`${t.status} = 'OUVERTE'`),
]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  cashSessionId: uuid("cash_session_id").notNull().references(() => cashSessions.id),
  method: paymentMethodEnum("method").notNull(),
  amount: integer("amount").notNull(), // > 0
  reference: text("reference"), // n° transaction MoMo / OM
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: text("voided_by"),
  voidReason: text("void_reason"),
}, (t) => [
  index("payments_order_idx").on(t.orderId),
  index("payments_session_idx").on(t.cashSessionId),
]);

export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  cashSessionId: uuid("cash_session_id").notNull().references(() => cashSessions.id),
  label: text("label").notNull(),
  category: text("category").notNull(), // consommables, transport, énergie, autre
  method: paymentMethodEnum("method").notNull(),
  amount: integer("amount").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: text("voided_by"),
  voidReason: text("void_reason"),
});

export const cashSessionCounts = pgTable("cash_session_counts", {
  id: uuid("id").primaryKey().defaultRandom(),
  cashSessionId: uuid("cash_session_id").notNull().references(() => cashSessions.id),
  method: paymentMethodEnum("method").notNull(),
  expected: integer("expected").notNull(),
  counted: integer("counted").notNull(),
  difference: integer("difference").notNull(), // counted - expected
}, (t) => [uniqueIndex("csc_session_method_uq").on(t.cashSessionId, t.method)]);

/**
 * Sorties d'argent hors caisse comptoir (gérant) : achats d'intrants, salaires, loyer,
 * électricité et eau, entretien, taxes… Les petites dépenses du comptoir restent dans `expenses`.
 */
export const outflows = pgTable("outflows", {
  id: uuid("id").primaryKey().defaultRandom(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  category: outflowCategoryEnum("category").notNull(),
  label: text("label").notNull(),
  amount: integer("amount").notNull(), // FCFA
  method: outflowMethodEnum("method").notNull(),
  beneficiary: text("beneficiary"), // fournisseur ou employé
  salaryPeriod: text("salary_period"), // « 2026-10 » pour un salaire
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: text("voided_by"),
  voidReason: text("void_reason"),
}, (t) => [
  index("outflows_date_idx").on(t.occurredAt),
  index("outflows_category_idx").on(t.category),
]);

export type OutflowCategory = (typeof outflowCategoryEnum.enumValues)[number];
export type OutflowMethod = (typeof outflowMethodEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type DiscountType = (typeof discountTypeEnum.enumValues)[number];
