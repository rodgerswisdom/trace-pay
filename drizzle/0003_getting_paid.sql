CREATE TABLE "confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"exporter_id" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"exporter_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"bank_code" text,
	"account_number" text NOT NULL,
	"last4" text NOT NULL,
	"account_name" text NOT NULL,
	"currency" text DEFAULT 'KES' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"exporter_id" text NOT NULL,
	"payout_account_id" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"fx_rate" double precision NOT NULL,
	"fee_minor" bigint NOT NULL,
	"receive_minor" bigint NOT NULL,
	"status" text DEFAULT 'initiated' NOT NULL,
	"reference" text NOT NULL,
	"payaza_reference" text,
	"failure_reason" text,
	"practice" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	CONSTRAINT "withdrawals_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "exporters" ADD COLUMN "withdrawals_frozen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "confirmations" ADD CONSTRAINT "confirmations_exporter_id_exporters_id_fk" FOREIGN KEY ("exporter_id") REFERENCES "public"."exporters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_exporter_id_exporters_id_fk" FOREIGN KEY ("exporter_id") REFERENCES "public"."exporters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_exporter_id_exporters_id_fk" FOREIGN KEY ("exporter_id") REFERENCES "public"."exporters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_payout_account_id_payout_accounts_id_fk" FOREIGN KEY ("payout_account_id") REFERENCES "public"."payout_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payout_accounts_exporter_idx" ON "payout_accounts" USING btree ("exporter_id");--> statement-breakpoint
CREATE INDEX "withdrawals_exporter_idx" ON "withdrawals" USING btree ("exporter_id");--> statement-breakpoint
-- A saved account's details never change, and its 24-hour hold can't be shortened: a change is a new account.
CREATE FUNCTION payout_accounts_fixed() RETURNS trigger AS $$
BEGIN
  IF NEW.account_number IS DISTINCT FROM OLD.account_number OR NEW.bank_code IS DISTINCT FROM OLD.bank_code
     OR NEW.type IS DISTINCT FROM OLD.type OR NEW.exporter_id IS DISTINCT FROM OLD.exporter_id
     OR NEW.active_at IS DISTINCT FROM OLD.active_at OR NEW.account_name IS DISTINCT FROM OLD.account_name THEN
    RAISE EXCEPTION 'payout account details are fixed; add a new account instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payout_accounts_fixed BEFORE UPDATE ON payout_accounts FOR EACH ROW EXECUTE FUNCTION payout_accounts_fixed();
--> statement-breakpoint
CREATE FUNCTION payout_accounts_no_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'payout accounts are removed by setting removed_at, never deleted';
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payout_accounts_no_delete BEFORE DELETE ON payout_accounts FOR EACH ROW EXECUTE FUNCTION payout_accounts_no_delete();
--> statement-breakpoint
-- A withdrawal's amount, account and reference never change; only its status moves forward.
CREATE FUNCTION withdrawals_fixed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'withdrawals are never deleted';
  END IF;
  IF NEW.amount_minor <> OLD.amount_minor OR NEW.currency <> OLD.currency OR NEW.payout_account_id <> OLD.payout_account_id
     OR NEW.reference <> OLD.reference OR NEW.receive_minor <> OLD.receive_minor OR NEW.fee_minor <> OLD.fee_minor
     OR NEW.exporter_id <> OLD.exporter_id THEN
    RAISE EXCEPTION 'withdrawal amounts and destination are fixed';
  END IF;
  IF OLD.status IN ('received', 'failed') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'withdrawal % is final', OLD.status;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER withdrawals_fixed BEFORE UPDATE OR DELETE ON withdrawals FOR EACH ROW EXECUTE FUNCTION withdrawals_fixed();
--> statement-breakpoint
CREATE UNIQUE INDEX payout_accounts_one_default ON payout_accounts (exporter_id) WHERE is_default AND removed_at IS NULL;
