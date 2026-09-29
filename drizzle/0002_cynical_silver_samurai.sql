CREATE TABLE "deal_documents" (
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
ALTER TABLE "deal_documents" ADD CONSTRAINT "deal_documents_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_documents_deal_idx" ON "deal_documents" USING btree ("deal_id");