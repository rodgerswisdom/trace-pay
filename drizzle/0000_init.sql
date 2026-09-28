CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`reason` text NOT NULL,
	`description` text NOT NULL,
	`photo_keys` text DEFAULT '[]' NOT NULL,
	`amount_requested_minor` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`response_note` text,
	`agreed_amount_minor` integer,
	`created_at` integer NOT NULL,
	`responded_at` integer,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer NOT NULL,
	`number` text GENERATED ALWAYS AS (('TP-' || printf('%04d', seq))) VIRTUAL NOT NULL,
	`exporter_id` text NOT NULL,
	`buyer_company` text NOT NULL,
	`buyer_contact` text NOT NULL,
	`buyer_email` text NOT NULL,
	`product` text NOT NULL,
	`weight_kg` integer NOT NULL,
	`price_per_kg_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`total_minor` integer NOT NULL,
	`deposit_pct` integer NOT NULL,
	`destination` text NOT NULL,
	`dispatch_date` text NOT NULL,
	`status` text DEFAULT 'awaiting_deposit' NOT NULL,
	`buyer_token` text NOT NULL,
	`proof_locked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`exporter_id`) REFERENCES `exporters`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deals_seq_unique` ON `deals` (`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `deals_buyer_token_unique` ON `deals` (`buyer_token`);--> statement-breakpoint
CREATE INDEX `deals_exporter_idx` ON `deals` (`exporter_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`actor` text NOT NULL,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_deal_idx` ON `events` (`deal_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `exporters` (
	`id` text PRIMARY KEY NOT NULL,
	`business_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`password_hash` text NOT NULL,
	`settlement_bank` text,
	`settlement_account` text,
	`language` text DEFAULT 'en' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exporters_email_unique` ON `exporters` (`email`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`merchant_reference` text NOT NULL,
	`payaza_reference` text,
	`fx_rate` real,
	`kes_amount_minor` integer,
	`paid_at` integer,
	`settlement_reference` text,
	`settled_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_merchant_reference_unique` ON `payments` (`merchant_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_payaza_reference_unique` ON `payments` (`payaza_reference`);--> statement-breakpoint
CREATE INDEX `payments_deal_idx` ON `payments` (`deal_id`);--> statement-breakpoint
CREATE TABLE `proof_items` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`issuer` text,
	`value` text,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer,
	`sha256` text,
	`received_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proof_items_file_key_unique` ON `proof_items` (`file_key`);--> statement-breakpoint
CREATE INDEX `proof_items_deal_idx` ON `proof_items` (`deal_id`);