CREATE TABLE `block_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`block_id` integer NOT NULL,
	`movement_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`set_number` integer,
	`load_g` integer,
	`reps` integer,
	`distance_m` integer,
	`duration_sec` integer,
	`calories` integer,
	`is_warmup` integer DEFAULT false NOT NULL,
	`is_failed` integer DEFAULT false NOT NULL,
	`note` text,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `block_movements_movement_idx` ON `block_movements` (`movement_id`);--> statement-breakpoint
CREATE INDEX `block_movements_block_idx` ON `block_movements` (`block_id`,`position`,`set_number`);--> statement-breakpoint
CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`kind` text NOT NULL,
	`title` text,
	`benchmark_id` integer,
	`raw_text` text NOT NULL,
	`format` text NOT NULL,
	`score_type` text NOT NULL,
	`score_value` integer,
	`score_rounds` integer,
	`score_reps` integer,
	`capped` integer DEFAULT false NOT NULL,
	`time_cap_sec` integer,
	`compare_to_block_id` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benchmark_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `blocks_session_idx` ON `blocks` (`session_id`,`position`);--> statement-breakpoint
CREATE INDEX `blocks_kind_idx` ON `blocks` (`kind`);--> statement-breakpoint
CREATE INDEX `blocks_benchmark_idx` ON `blocks` (`benchmark_id`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`kind` text DEFAULT 'movement' NOT NULL,
	`modality` text,
	`pattern` text,
	`aliases` text DEFAULT '[]' NOT NULL,
	`default_score_type` text,
	`prescription` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movements_slug_idx` ON `movements` (`slug`);--> statement-breakpoint
CREATE INDEX `movements_kind_idx` ON `movements` (`kind`);--> statement-breakpoint
CREATE TABLE `prs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movement_id` integer NOT NULL,
	`score_type` text NOT NULL,
	`rep_scheme` text NOT NULL,
	`value` integer NOT NULL,
	`secondary` integer,
	`date` text NOT NULL,
	`block_id` integer,
	`previous_value` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`movement_id`) REFERENCES `movements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `blocks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prs_unique_idx` ON `prs` (`movement_id`,`score_type`,`rep_scheme`);--> statement-breakpoint
CREATE INDEX `prs_date_idx` ON `prs` (`date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`label` text,
	`notes` text,
	`rpe` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_date_idx` ON `sessions` (`date`);