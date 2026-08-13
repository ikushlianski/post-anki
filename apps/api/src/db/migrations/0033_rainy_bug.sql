CREATE TABLE IF NOT EXISTS "open_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_item_id" text NOT NULL,
	"topic_id" text,
	"topic_title" text,
	"question_text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"answer_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "open_questions_status_created_at" ON "open_questions" USING btree ("status","created_at");