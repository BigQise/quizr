CREATE TABLE `card_state` (
	`card_id` text PRIMARY KEY NOT NULL,
	`sort_status` text DEFAULT 'unsorted' NOT NULL,
	`learn_stage` integer DEFAULT 0 NOT NULL,
	`last_answered_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`term` text NOT NULL,
	`definition` text NOT NULL,
	`position` integer NOT NULL,
	`starred` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_set_position_idx` ON `cards` (`set_id`,`position`);--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`mode` text NOT NULL,
	`question_type` text NOT NULL,
	`correct` integer NOT NULL,
	`rating` text,
	`answered_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_log_card_idx` ON `review_log` (`card_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`set_id` text NOT NULL,
	`mode` text NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`set_id`, `mode`),
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `test_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`test_json` text NOT NULL,
	`answers_json` text NOT NULL,
	`earned` integer NOT NULL,
	`possible` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`set_id`) REFERENCES `sets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_attempts_set_idx` ON `test_attempts` (`set_id`,`submitted_at`);