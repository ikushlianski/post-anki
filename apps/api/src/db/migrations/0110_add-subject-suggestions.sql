CREATE TABLE IF NOT EXISTS "subject_suggestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger" text NOT NULL,
	"calls" integer NOT NULL,
	"created" integer NOT NULL,
	"pool_size" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subject_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"parent_subject_id" text,
	"proposed_name" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"evidence_samples" jsonb NOT NULL,
	"evidence_count" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_subject_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_suggestions_dedupe_key_unique" ON "subject_suggestions" USING btree ("dedupe_key");