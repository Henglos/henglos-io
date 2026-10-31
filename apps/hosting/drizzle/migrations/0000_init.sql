CREATE TABLE `account_packages` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`package_id` text(36) NOT NULL,
	`token` text(512),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_packages_user_package_unique` ON `account_packages` (`user_id`,`package_id`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`type` text(64) NOT NULL,
	`name` text(100) NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `driver_pair_token` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`pair_token` text(64),
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `drivers` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`refresh_token` text(64),
	`refresh_token_expires_at` integer,
	`device_hwid` text(128) NOT NULL,
	`device_name` text(255),
	`device_user` text(255),
	`name` text(100) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drivers_refresh_token_unique` ON `drivers` (`refresh_token`);--> statement-breakpoint
CREATE TABLE `package_links` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`package_id` text(36),
	`account_package_id` text(36),
	`origin` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_package_id`) REFERENCES `account_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`name` text(214) NOT NULL,
	`spec` text(214) NOT NULL,
	`version` text(256) NOT NULL,
	`author` text(512) DEFAULT '' NOT NULL,
	`description` text(1024) DEFAULT '' NOT NULL,
	`type` text NOT NULL,
	`schema` text NOT NULL,
	`registry` text(512) NOT NULL,
	`platform` text(32) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `packages_spec_version_unique` ON `packages` (`spec`,`version`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`username` text(30) NOT NULL,
	`email` text(254) NOT NULL,
	`password` text(255) NOT NULL,
	`refresh_token` text(64),
	`refresh_token_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_refresh_token_unique` ON `users` (`refresh_token`);--> statement-breakpoint
CREATE TABLE `workflow_components` (
	`workflow_id` text(36) NOT NULL,
	`package_link_id` text(36) NOT NULL,
	PRIMARY KEY(`workflow_id`, `package_link_id`),
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`package_link_id`) REFERENCES `package_links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workflow_files` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`workflow_id` text(36) NOT NULL,
	`name` text(255) NOT NULL,
	`mime` text(127) NOT NULL,
	`size` integer NOT NULL,
	`sha256` text(64) NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflows` (
	`id` text(36) PRIMARY KEY NOT NULL,
	`user_id` text(36) NOT NULL,
	`data` text NOT NULL,
	`collab_state` blob,
	`board_id` text(36) NOT NULL,
	`platform` text(32) NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
