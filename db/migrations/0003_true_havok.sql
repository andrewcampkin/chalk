--> Hand-added: SQLite refuses DROP COLUMN while a trigger names the column, and
--> the FTS triggers index blocks.notes. lib/db.ts rebuilds them from
--> db/sql/fts.sql immediately after the migrations run.
DROP TRIGGER IF EXISTS blocks_fts_ai;--> statement-breakpoint
DROP TRIGGER IF EXISTS blocks_fts_ad;--> statement-breakpoint
DROP TRIGGER IF EXISTS blocks_fts_au;--> statement-breakpoint
DROP TABLE IF EXISTS blocks_fts;--> statement-breakpoint
ALTER TABLE `block_movements` DROP COLUMN `duration_sec`;--> statement-breakpoint
ALTER TABLE `block_movements` DROP COLUMN `is_warmup`;--> statement-breakpoint
ALTER TABLE `block_movements` DROP COLUMN `note`;--> statement-breakpoint
ALTER TABLE `blocks` DROP COLUMN `time_cap_sec`;--> statement-breakpoint
ALTER TABLE `blocks` DROP COLUMN `compare_to_block_id`;--> statement-breakpoint
ALTER TABLE `blocks` DROP COLUMN `notes`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `notes`;
