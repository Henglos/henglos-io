CREATE TABLE `default_package_offers` (
	`user_id` text(36) NOT NULL,
	`name` text(214) NOT NULL,
	`offered_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `name`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- The users made before this table were offered, when their account was
-- made, the default packages of the time. One they removed stays removed.
INSERT INTO `default_package_offers` (`user_id`, `name`, `offered_at`)
SELECT `users`.`id`, `offered`.`name`, unixepoch()
FROM `users`, (
	SELECT column1 AS `name` FROM (VALUES
	('@henglosio/board-esp32'),
	('@henglosio/component-code'),
	('@henglosio/component-dht'),
	('@henglosio/component-display'),
	('@henglosio/component-filesystem'),
	('@henglosio/component-gpio'),
	('@henglosio/component-http'),
	('@henglosio/component-imu'),
	('@henglosio/component-ir'),
	('@henglosio/component-joystick'),
	('@henglosio/component-lcd'),
	('@henglosio/component-pwm'),
	('@henglosio/component-servo'),
	('@henglosio/component-soundsensor'),
	('@henglosio/component-time'),
	('@henglosio/component-ultrasonicsensor'),
	('@henglosio/component-watersensor'),
	('@henglosio/component-wifi')
	)
) AS `offered`;
