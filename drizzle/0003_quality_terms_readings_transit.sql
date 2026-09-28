CREATE TABLE `readings` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`stage` text NOT NULL,
	`recorded_by` text NOT NULL,
	`dry_matter_pct` real NOT NULL,
	`sample_size` integer NOT NULL,
	`device` text NOT NULL,
	`pulp_temp_c` real,
	`notes` text,
	`proof_item_id` text,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readings_deal_stage_uq` ON `readings` (`deal_id`,`stage`);--> statement-breakpoint
CREATE TABLE `transit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`deal_id` text NOT NULL,
	`file_key` text NOT NULL,
	`file_name` text NOT NULL,
	`sha256` text NOT NULL,
	`device` text,
	`points` text NOT NULL,
	`count` integer NOT NULL,
	`min_c` real NOT NULL,
	`max_c` real NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`received_at` integer NOT NULL,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transit_logs_deal_id_unique` ON `transit_logs` (`deal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `transit_logs_file_key_unique` ON `transit_logs` (`file_key`);--> statement-breakpoint
ALTER TABLE `claims` ADD `applies_to` text DEFAULT 'balance' NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `final_pct` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deals` ADD `min_dry_matter_pct` real;--> statement-breakpoint
ALTER TABLE `deals` ADD `temp_min_c` real;--> statement-breakpoint
ALTER TABLE `deals` ADD `temp_max_c` real;--> statement-breakpoint
ALTER TABLE `deals` ADD `breach_adjust_pct` integer;--> statement-breakpoint
ALTER TABLE `deals` ADD `arrived_at` integer;