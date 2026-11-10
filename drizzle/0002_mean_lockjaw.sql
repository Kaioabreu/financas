CREATE TABLE `bill` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`due_date` text NOT NULL,
	`total_amount` real,
	`currency_code` text,
	`minimum_payment_amount` real,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `identity` (
	`item_id` text PRIMARY KEY NOT NULL,
	`full_name` text,
	`document` text,
	`document_type` text,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `investment` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text,
	`subtype` text,
	`name` text NOT NULL,
	`balance` real,
	`amount` real,
	`amount_original` real,
	`date` text,
	`currency_code` text,
	`status` text,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `investment_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`investment_id` text NOT NULL,
	`type` text,
	`date` text NOT NULL,
	`description` text,
	`quantity` real,
	`value` real,
	`amount` real,
	`extra` text
);
--> statement-breakpoint
ALTER TABLE `connection` ADD `last_read_at` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `attempt_complete` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `connection` ADD `lock_triggered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `connection` ADD `product_dates` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `data_at` text;