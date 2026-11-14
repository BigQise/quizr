CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `srs_state` (
	`card_id` text PRIMARY KEY NOT NULL,
	`due` integer NOT NULL,
	`state_json` text NOT NULL,
	`introduced_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `srs_state_due_idx` ON `srs_state` (`due`);