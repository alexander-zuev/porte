ALTER TABLE `account` ADD `issuer` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account` (`issuer`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_deviceCode_uidx` ON `device_code` (`device_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `deviceCode_userCode_uidx` ON `device_code` (`user_code`);