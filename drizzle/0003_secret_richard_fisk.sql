CREATE TABLE `manual_edit` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount` real NOT NULL,
	`description` text NOT NULL,
	`date` text NOT NULL,
	`nature` text NOT NULL,
	`category` text,
	`origin` text
);
--> statement-breakpoint
CREATE TABLE `user_rule` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`contains` text NOT NULL,
	`nature` text,
	`category` text,
	`origin` text
);
