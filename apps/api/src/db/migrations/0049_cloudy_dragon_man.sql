CREATE TABLE IF NOT EXISTS "subject_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "category_id" text;