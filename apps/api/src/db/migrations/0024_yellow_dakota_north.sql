CREATE TABLE IF NOT EXISTS "gap_mastery" (
	"id" text PRIMARY KEY NOT NULL,
	"gap_id" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"mastery_stage" integer DEFAULT 0 NOT NULL,
	"correct_count_in_cycle" integer DEFAULT 0 NOT NULL,
	"incorrect_count_in_cycle" integer DEFAULT 0 NOT NULL,
	"last_correct_at_sequence" integer,
	"scheduled_for_sequence" integer,
	"last_correct_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mastered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "probe_session_questions" ADD COLUMN "gap_label" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "gap_mastery_sequence_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gap_mastery_gap_id_unique" ON "gap_mastery" USING btree ("gap_id");