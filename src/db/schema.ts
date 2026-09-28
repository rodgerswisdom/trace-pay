import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Amounts are stored in minor units (cents) of the deal currency; KES amounts in cents of KES.
// Timestamps are stored as epoch milliseconds (UTC).

export const DEAL_STATUSES = [
  "awaiting_deposit",
  "deposit_paid",
  "proof_attached",
  "claim_open",
  "balance_agreed",
  "awaiting_arrival",
  "final_due",
  "balance_paid",
  "settled",
  "cancelled",
] as const;
export const PROOF_TYPES = [
  "dry_matter",
  "phyto",
  "loading_photo",
  "airway_bill",
  "inspection_report",
  "temperature_log",
] as const;
export const CLAIM_REASONS = ["underweight", "immature", "overripe_damaged", "other"] as const;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

export const exporters = sqliteTable("exporters", {
  id: id(),
  businessName: text("business_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  settlementBank: text("settlement_bank"),
  settlementAccount: text("settlement_account"),
  language: text("language", { enum: ["en", "sw"] }).notNull().default("en"),
  createdAt: createdAt(),
});

export const deals = sqliteTable(
  "deals",
  {
    id: id(),
    // Assigned as max+1 inside the create transaction (SQLite serialises writes).
    seq: integer("seq").notNull().unique(),
    number: text("number").generatedAlwaysAs(sql`('TP-' || printf('%04d', seq))`, { mode: "virtual" }).notNull(),
    exporterId: text("exporter_id")
      .notNull()
      .references(() => exporters.id),
    buyerCompany: text("buyer_company").notNull(),
    buyerContact: text("buyer_contact").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    // E.164, e.g. +971501234567. Payaza's card checkout requires the payer's phone with country code.
    buyerPhone: text("buyer_phone"),
    product: text("product").notNull(),
    weightKg: integer("weight_kg").notNull(),
    pricePerKgMinor: integer("price_per_kg_minor").notNull(),
    currency: text("currency").notNull(),
    totalMinor: integer("total_minor").notNull(),
    depositPct: integer("deposit_pct").notNull(),
    // Optional final tranche, requested when the buyer confirms arrival.
    finalPct: integer("final_pct").notNull().default(0),
    // Quality terms, agreed before the deposit. Null = not agreed.
    minDryMatterPct: real("min_dry_matter_pct"),
    tempMinC: real("temp_min_c"),
    tempMaxC: real("temp_max_c"),
    /** % of the deal value that comes off if an agreed term is breached. */
    breachAdjustPct: integer("breach_adjust_pct"),
    destination: text("destination").notNull(),
    dispatchDate: text("dispatch_date").notNull(), // YYYY-MM-DD
    status: text("status", { enum: DEAL_STATUSES }).notNull().default("awaiting_deposit"),
    buyerToken: text("buyer_token").notNull().unique(),
    proofLockedAt: ts("proof_locked_at"),
    arrivedAt: ts("arrived_at"),
    createdAt: createdAt(),
  },
  (t) => [index("deals_exporter_idx").on(t.exporterId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    kind: text("kind", { enum: ["deposit", "balance", "final"] }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["pending", "paid", "settled"] }).notNull().default("pending"),
    // Our reference, sent to Payaza as transaction_reference and echoed back as merchant_reference.
    merchantReference: text("merchant_reference").notNull().unique(),
    // Payaza's own reference, set on confirmation. Unique so a duplicate confirmation can't apply twice.
    payazaReference: text("payaza_reference").unique(),
    fxRate: real("fx_rate"),
    kesAmountMinor: integer("kes_amount_minor"),
    paidAt: ts("paid_at"),
    settlementReference: text("settlement_reference"),
    settledAt: ts("settled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_deal_idx").on(t.dealId)],
);

export const proofItems = sqliteTable(
  "proof_items",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    type: text("type", { enum: PROOF_TYPES }).notNull(),
    source: text("source", { enum: ["independent", "exporter"] }).notNull(),
    issuer: text("issuer"),
    value: text("value"),
    fileKey: text("file_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes"),
    // Null until the server has read the uploaded object and fingerprinted it.
    sha256: text("sha256"),
    receivedAt: ts("received_at"),
    createdAt: createdAt(),
  },
  (t) => [index("proof_items_deal_idx").on(t.dealId)],
);

export const claims = sqliteTable("claims", {
  id: id(),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id),
  reason: text("reason", { enum: CLAIM_REASONS }).notNull(),
  description: text("description").notNull(),
  photoKeys: text("photo_keys", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  amountRequestedMinor: integer("amount_requested_minor").notNull(),
  /** The unpaid tranche the claim holds and reduces. */
  appliesTo: text("applies_to", { enum: ["balance", "final"] }).notNull().default("balance"),
  status: text("status", { enum: ["open", "accepted", "countered", "rejected"] }).notNull().default("open"),
  responseNote: text("response_note"),
  agreedAmountMinor: integer("agreed_amount_minor"),
  createdAt: createdAt(),
  respondedAt: ts("responded_at"),
});

// Structured quality readings: at the packhouse (origin, exporter) and on arrival (buyer).
// One per stage per deal. Triggers: never updated; origin locked with the proof, arrival never deleted.
export const readings = sqliteTable(
  "readings",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    stage: text("stage", { enum: ["origin", "arrival"] }).notNull(),
    recordedBy: text("recorded_by", { enum: ["exporter", "buyer"] }).notNull(),
    dryMatterPct: real("dry_matter_pct").notNull(),
    sampleSize: integer("sample_size").notNull(),
    device: text("device").notNull(),
    pulpTempC: real("pulp_temp_c"),
    notes: text("notes"),
    proofItemId: text("proof_item_id"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("readings_deal_stage_uq").on(t.dealId, t.stage)],
);

// The container tracker's export, attached after dispatch. One per deal, never changed.
export const transitLogs = sqliteTable("transit_logs", {
  id: id(),
  dealId: text("deal_id")
    .notNull()
    .unique()
    .references(() => deals.id),
  fileKey: text("file_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  sha256: text("sha256").notNull(),
  device: text("device"),
  /** [epochMs, °C] pairs, sorted by time. */
  points: text("points", { mode: "json" }).$type<[number, number][]>().notNull(),
  count: integer("count").notNull(),
  minC: real("min_c").notNull(),
  maxC: real("max_c").notNull(),
  startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
  endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
  isSample: integer("is_sample", { mode: "boolean" }).notNull().default(false),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
});

// Append-only. A trigger in the migrations rejects UPDATE and DELETE.
export const events = sqliteTable(
  "events",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    actor: text("actor", { enum: ["exporter", "buyer", "payaza", "system"] }).notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("events_deal_idx").on(t.dealId, t.createdAt)],
);

export const dealsRelations = relations(deals, ({ one, many }) => ({
  exporter: one(exporters, { fields: [deals.exporterId], references: [exporters.id] }),
  payments: many(payments),
  proofItems: many(proofItems),
  claims: many(claims),
  events: many(events),
  readings: many(readings),
  transitLog: one(transitLogs, { fields: [deals.id], references: [transitLogs.dealId] }),
}));
export const readingsRelations = relations(readings, ({ one }) => ({
  deal: one(deals, { fields: [readings.dealId], references: [deals.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  deal: one(deals, { fields: [payments.dealId], references: [deals.id] }),
}));
export const proofItemsRelations = relations(proofItems, ({ one }) => ({
  deal: one(deals, { fields: [proofItems.dealId], references: [deals.id] }),
}));
export const claimsRelations = relations(claims, ({ one }) => ({
  deal: one(deals, { fields: [claims.dealId], references: [deals.id] }),
}));
export const eventsRelations = relations(events, ({ one }) => ({
  deal: one(deals, { fields: [events.dealId], references: [deals.id] }),
}));

export type Exporter = typeof exporters.$inferSelect;
export type Deal = typeof deals.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ProofItem = typeof proofItems.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type DealEvent = typeof events.$inferSelect;
export type DealStatus = Deal["status"];
export type Reading = typeof readings.$inferSelect;
export type TransitLog = typeof transitLogs.$inferSelect;
