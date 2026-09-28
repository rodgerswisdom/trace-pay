import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Postgres. Amounts are in minor units (cents) of the deal currency; KES amounts in cents of KES.
// Money columns are 64-bit: a large deal in KES cents overflows a 32-bit integer.

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

export type EvidenceItem = { requirement: string; key: string; contentType: string; fileName: string; receivedAt: string };

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });

export const exporters = pgTable("exporters", {
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

export const deals = pgTable(
  "deals",
  {
    id: id(),
    // Assigned as max+1 inside the create transaction; the unique constraint catches a race.
    seq: integer("seq").notNull().unique(),
    number: text("number").generatedAlwaysAs(sql`'TP-' || lpad(seq::text, 4, '0')`).notNull(),
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
    pricePerKgMinor: money("price_per_kg_minor").notNull(),
    currency: text("currency").notNull(),
    totalMinor: money("total_minor").notNull(),
    depositPct: integer("deposit_pct").notNull(),
    // Optional final tranche, requested when the buyer confirms arrival.
    finalPct: integer("final_pct").notNull().default(0),
    // Quality terms, agreed before the deposit. Null = not agreed.
    minDryMatterPct: doublePrecision("min_dry_matter_pct"),
    tempMinC: doublePrecision("temp_min_c"),
    tempMaxC: doublePrecision("temp_max_c"),
    /** % of the deal value that comes off if an agreed term is breached. */
    breachAdjustPct: integer("breach_adjust_pct"),
    /** Delivered net weight may be this % below the invoiced weight. Null = no weight term. */
    weightTolerancePct: doublePrecision("weight_tolerance_pct"),
    /** Adjustments can be requested until this many hours after proof of dispatch. */
    adjustWindowHours: integer("adjust_window_hours").notNull().default(120),
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

export const payments = pgTable(
  "payments",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    kind: text("kind", { enum: ["deposit", "balance", "final"] }).notNull(),
    amountMinor: money("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: text("status", { enum: ["pending", "paid", "settled"] }).notNull().default("pending"),
    // Our reference, sent to Payaza as transaction_reference and echoed back as merchant_reference.
    merchantReference: text("merchant_reference").notNull().unique(),
    // Payaza's own reference, set on confirmation. Unique so a duplicate confirmation can't apply twice.
    payazaReference: text("payaza_reference").unique(),
    fxRate: doublePrecision("fx_rate"),
    kesAmountMinor: money("kes_amount_minor"),
    paidAt: ts("paid_at"),
    settlementReference: text("settlement_reference"),
    settledAt: ts("settled_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_deal_idx").on(t.dealId)],
);

export const proofItems = pgTable(
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

export const claims = pgTable("claims", {
  id: id(),
  dealId: text("deal_id")
    .notNull()
    .references(() => deals.id),
  reason: text("reason", { enum: CLAIM_REASONS }).notNull(),
  description: text("description").notNull(),
  photoKeys: jsonb("photo_keys").$type<string[]>().notNull().default([]),
  amountRequestedMinor: money("amount_requested_minor").notNull(),
  /** The unpaid tranche the claim holds and reduces. */
  appliesTo: text("applies_to", { enum: ["balance", "final"] }).notNull().default("balance"),
  status: text("status", { enum: ["open", "accepted", "countered", "rejected", "withdrawn"] }).notNull().default("open"),
  /** Evidence the buyer attached, one entry per checklist item. */
  evidence: jsonb("evidence").$type<EvidenceItem[]>().notNull().default([]),
  measuredBy: text("measured_by", { enum: ["inspector", "buyer"] }),
  responseNote: text("response_note"),
  agreedAmountMinor: money("agreed_amount_minor"),
  createdAt: createdAt(),
  respondedAt: ts("responded_at"),
});

// Structured quality readings: at the packhouse (origin, exporter) and on arrival (buyer).
// One per stage per deal. Triggers: never updated; origin locked with the proof, arrival never deleted.
export const readings = pgTable(
  "readings",
  {
    id: id(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    stage: text("stage", { enum: ["origin", "arrival"] }).notNull(),
    recordedBy: text("recorded_by", { enum: ["exporter", "buyer"] }).notNull(),
    dryMatterPct: doublePrecision("dry_matter_pct"),
    sampleSize: integer("sample_size").notNull(),
    device: text("device").notNull(),
    pulpTempC: doublePrecision("pulp_temp_c"),
    netWeightKg: doublePrecision("net_weight_kg"),
    /** Who took the measurement: an independent inspector, the buyer, or the exporter's packhouse. */
    measuredBy: text("measured_by", { enum: ["inspector", "buyer", "exporter"] }),
    notes: text("notes"),
    proofItemId: text("proof_item_id"),
    recordedAt: ts("recorded_at").notNull(),
  },
  (t) => [uniqueIndex("readings_deal_stage_uq").on(t.dealId, t.stage)],
);

// The container tracker's export, attached after dispatch. One per deal, never changed.
export const transitLogs = pgTable("transit_logs", {
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
  points: jsonb("points").$type<[number, number][]>().notNull(),
  count: integer("count").notNull(),
  minC: doublePrecision("min_c").notNull(),
  maxC: doublePrecision("max_c").notNull(),
  startAt: ts("start_at").notNull(),
  endAt: ts("end_at").notNull(),
  isSample: boolean("is_sample").notNull().default(false),
  receivedAt: ts("received_at").notNull(),
});

// Append-only. A trigger in the migrations rejects UPDATE and DELETE.
export const events = pgTable(
  "events",
  {
    id: id(),
    // Insertion order, so events written in the same millisecond keep their order.
    n: bigserial("n", { mode: "number" }).notNull(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    actor: text("actor", { enum: ["exporter", "buyer", "payaza", "system"] }).notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("events_deal_idx").on(t.dealId, t.n)],
);

// Uploaded files (proof, claim photos, tracker exports), stored in Postgres so the only thing a deploy
// needs is DATABASE_URL. Keys are always generated by us. Uploads are compressed on the phone first.
export const files = pgTable("files", {
  key: text("key").primaryKey(),
  bytes: bytea("bytes").notNull(),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: createdAt(),
});

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
