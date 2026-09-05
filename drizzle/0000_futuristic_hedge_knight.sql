CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_session_created` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`source_truncated` integer DEFAULT 0 NOT NULL,
	`run_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_owner_created` ON `sessions` (`owner_id`,`created_at`);