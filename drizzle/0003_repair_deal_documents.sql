CREATE TABLE IF NOT EXISTS "deal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"category" text NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone NOT NULL,
	"locked_at" timestamp with time zone,
	CONSTRAINT "deal_documents_file_key_unique" UNIQUE("file_key")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deal_documents_deal_idx" ON "deal_documents" USING btree ("deal_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION tp_deal_documents_unlocked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF (SELECT locked_at FROM deal_documents WHERE id = COALESCE(NEW.id, OLD.id)) IS NOT NULL THEN
		RAISE EXCEPTION 'deal documents are locked';
	END IF;
	IF (SELECT proof_locked_at FROM deals WHERE id = COALESCE(NEW.deal_id, OLD.deal_id)) IS NOT NULL THEN
		RAISE EXCEPTION 'deal documents are locked';
	END IF;
	RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
DO $$ BEGIN
	CREATE TRIGGER deal_documents_lock_guard BEFORE UPDATE OR DELETE ON deal_documents
		FOR EACH ROW EXECUTE FUNCTION tp_deal_documents_unlocked();
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;