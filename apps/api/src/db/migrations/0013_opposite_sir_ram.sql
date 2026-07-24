CREATE TABLE IF NOT EXISTS "lecture_citations" (
	"id" text PRIMARY KEY NOT NULL,
	"lecture_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lecture_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"lecture_id" text NOT NULL,
	"order" integer NOT NULL,
	"heading" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lecture_source_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"why_selected" text NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"fetched_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lectures" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lectures_topic_id_unique" ON "lectures" USING btree ("topic_id");