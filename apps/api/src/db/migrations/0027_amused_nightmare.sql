CREATE TABLE IF NOT EXISTS "subject_duplicate_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_a_id" text NOT NULL,
	"subject_b_id" text NOT NULL,
	"similarity" real NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'embedding-similarity' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "embedding_hash" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subject_duplicate_suggestions_pending_pair_unique" ON "subject_duplicate_suggestions" USING btree ("subject_a_id","subject_b_id") WHERE "subject_duplicate_suggestions"."status" = 'pending';