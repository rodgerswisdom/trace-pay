ALTER TABLE "readings" ALTER COLUMN "dry_matter_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "evidence" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "measured_by" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "weight_tolerance_pct" double precision;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "adjust_window_hours" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "net_weight_kg" double precision;--> statement-breakpoint
ALTER TABLE "readings" ADD COLUMN "measured_by" text;