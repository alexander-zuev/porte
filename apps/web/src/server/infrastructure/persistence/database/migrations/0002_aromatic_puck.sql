-- Indexes for device_code.
--
-- The generator emits this table without any, yet both of its lookups are by
-- code: the phone verifies a user_code, the CLI polls a device_code. Without
-- these every pairing poll is a full table scan.
--
-- They live in a custom migration because `better-auth-generate` overwrites
-- auth.schema.ts in full, which would erase hand-added indexes.

CREATE UNIQUE INDEX `device_code_device_code_unique` ON `device_code` (`device_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `device_code_user_code_unique` ON `device_code` (`user_code`);--> statement-breakpoint
CREATE INDEX `device_code_expires_at_idx` ON `device_code` (`expires_at`);

-- Verify the indexes exist.
SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'device_code';
