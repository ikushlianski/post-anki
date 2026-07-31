CREATE TABLE IF NOT EXISTS "course_refocus_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"reason" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_refocus_dismissals_curriculum_id_reason_idx" ON "course_refocus_dismissals" USING btree ("curriculum_id","reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_curriculum_id_progress_last_interacted_at_idx" ON "topics" USING btree ("curriculum_id","progress_last_interacted_at");