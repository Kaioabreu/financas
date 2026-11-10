CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text,
	`name` text NOT NULL,
	`number` text,
	`balance` real,
	`currency_code` text,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `bank_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`description_raw` text,
	`amount` real NOT NULL,
	`amount_in_account_currency` real,
	`currency_code` text,
	`balance` real,
	`category` text,
	`category_id` text,
	`status` text,
	`type` text,
	`operation_type` text,
	`extra` text
);
--> statement-breakpoint
CREATE TABLE `connection` (
	`item_id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`connector_id` integer,
	`created_at` text,
	`consent_expires_at` text,
	`read_state` text NOT NULL
);
