CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
