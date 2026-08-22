CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`cwd` text NOT NULL,
	`title` text NOT NULL,
	`updated_at` integer NOT NULL,
	`sync_run_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_recent_idx` ON `conversation` (`updated_at`,`id`);