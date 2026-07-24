CREATE TABLE IF NOT EXISTS "study_item_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"topic_id" text,
	"item_text" text NOT NULL,
	"rating" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "study_item_feedback_item_unique" ON "study_item_feedback" USING btree ("item_type","item_id");