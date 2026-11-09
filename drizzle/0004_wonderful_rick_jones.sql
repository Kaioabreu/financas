CREATE TABLE `snapshot` (
	`date` text NOT NULL,
	`item_id` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`date`, `item_id`)
);
