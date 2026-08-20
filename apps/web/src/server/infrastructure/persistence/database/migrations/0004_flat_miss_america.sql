-- Recreated rather than altered: SQLite refuses to add a NOT NULL column
-- without a default, and a default here would invent a name for a machine
-- that never gave one. The table holds only undecided pairing codes, which
-- expire in ten minutes, so an in-flight `porte pair` is re-run at worst.
DROP TABLE `pairing_request`;--> statement-breakpoint
CREATE TABLE `pairing_request` (
	`user_code` text PRIMARY KEY NOT NULL,
	`host_name` text NOT NULL,
	`host_platform` text NOT NULL,
	`ip_address` text NOT NULL,
	`country` text,
	`city` text,
	`requested_at` integer NOT NULL
);
