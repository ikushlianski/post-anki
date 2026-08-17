-- Re-keys tracked_tool_scan_state from (tool_key) to (subject_id, tool_key).
-- Hand-ordered: drizzle-kit emits the ADD CONSTRAINT before the ADD COLUMN,
-- adds the column NOT NULL against a populated table, and leaves the old
-- primary key's DROP commented out because it cannot infer the constraint
-- name.
--
-- Existing rows carry no subject, so they are attributed to the single gated
-- subject if and only if exactly one exists (the state this migration was
-- written for: "Programming / Web Development"). With zero or several gated
-- subjects the rows are dropped instead of guessed — a dropped watermark
-- costs one redundant agent call per subject on the next scheduled run,
-- whereas a wrongly attributed one silently marks a never-scanned subject as
-- already scanned, which is the exact bug this migration exists to fix.
ALTER TABLE "tracked_tool_scan_state" ADD COLUMN "subject_id" text;--> statement-breakpoint
UPDATE "tracked_tool_scan_state"
SET "subject_id" = (SELECT MIN("subject_id") FROM "domain_nodes")
WHERE (SELECT COUNT(DISTINCT "subject_id") FROM "domain_nodes") = 1;--> statement-breakpoint
DELETE FROM "tracked_tool_scan_state" WHERE "subject_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tracked_tool_scan_state" ALTER COLUMN "subject_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tracked_tool_scan_state" DROP CONSTRAINT "tracked_tool_scan_state_pkey";--> statement-breakpoint
ALTER TABLE "tracked_tool_scan_state" ADD CONSTRAINT "tracked_tool_scan_state_subject_id_tool_key_pk" PRIMARY KEY("subject_id","tool_key");
