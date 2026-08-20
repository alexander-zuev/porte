CREATE TABLE `pairing_request` (
	`user_code` text PRIMARY KEY NOT NULL,
	`ip_address` text NOT NULL,
	`country` text,
	`city` text,
	`requested_at` integer NOT NULL
);
