CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"reason" text NOT NULL,
	"description" text NOT NULL,
	"photo_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amount_requested_minor" bigint NOT NULL,
	"applies_to" text DEFAULT 'balance' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"response_note" text,
	"agreed_amount_minor" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"number" text GENERATED ALWAYS AS ('TP-' || lpad(seq::text, 4, '0')) STORED NOT NULL,
	"exporter_id" text NOT NULL,
	"buyer_company" text NOT NULL,
	"buyer_contact" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_phone" text,
	"product" text NOT NULL,
	"weight_kg" integer NOT NULL,
	"price_per_kg_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"deposit_pct" integer NOT NULL,
	"final_pct" integer DEFAULT 0 NOT NULL,
	"min_dry_matter_pct" double precision,
	"temp_min_c" double precision,
	"temp_max_c" double precision,
	"breach_adjust_pct" integer,
	"destination" text NOT NULL,
	"dispatch_date" text NOT NULL,
	"status" text DEFAULT 'awaiting_deposit' NOT NULL,
	"buyer_token" text NOT NULL,
	"proof_locked_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_seq_unique" UNIQUE("seq"),
	CONSTRAINT "deals_buyer_token_unique" UNIQUE("buyer_token")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"n" bigserial NOT NULL,
	"deal_id" text NOT NULL,
	"actor" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exporters" (
	"id" text PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"settlement_bank" text,
	"settlement_account" text,
	"language" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exporters_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"key" text PRIMARY KEY NOT NULL,
	"bytes" "bytea" NOT NULL,
	"content_type" text,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"merchant_reference" text NOT NULL,
	"payaza_reference" text,
	"fx_rate" double precision,
	"kes_amount_minor" bigint,
	"paid_at" timestamp with time zone,
	"settlement_reference" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_merchant_reference_unique" UNIQUE("merchant_reference"),
	CONSTRAINT "payments_payaza_reference_unique" UNIQUE("payaza_reference")
);
--> statement-breakpoint
CREATE TABLE "proof_items" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"issuer" text,
	"value" text,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"sha256" text,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proof_items_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"stage" text NOT NULL,
	"recorded_by" text NOT NULL,
	"dry_matter_pct" double precision NOT NULL,
	"sample_size" integer NOT NULL,
	"device" text NOT NULL,
	"pulp_temp_c" double precision,
	"notes" text,
	"proof_item_id" text,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"device" text,
	"points" jsonb NOT NULL,
	"count" integer NOT NULL,
	"min_c" double precision NOT NULL,
	"max_c" double precision NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transit_logs_deal_id_unique" UNIQUE("deal_id"),
	CONSTRAINT "transit_logs_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_exporter_id_exporters_id_fk" FOREIGN KEY ("exporter_id") REFERENCES "public"."exporters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_items" ADD CONSTRAINT "proof_items_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transit_logs" ADD CONSTRAINT "transit_logs_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deals_exporter_idx" ON "deals" USING btree ("exporter_id");--> statement-breakpoint
CREATE INDEX "events_deal_idx" ON "events" USING btree ("deal_id","n");--> statement-breakpoint
CREATE INDEX "payments_deal_idx" ON "payments" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "proof_items_deal_idx" ON "proof_items" USING btree ("deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "readings_deal_stage_uq" ON "readings" USING btree ("deal_id","stage");