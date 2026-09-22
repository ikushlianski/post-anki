CREATE TABLE IF NOT EXISTS "content_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"source_ref" text NOT NULL,
	"suggested_placement" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_inbox_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
ALTER TABLE "facts" ADD COLUMN "topic_id" text;