CREATE TABLE IF NOT EXISTS "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"criteria_key" text NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source_duplicate_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"source_a_id" text NOT NULL,
	"source_b_id" text NOT NULL,
	"similarity" real,
	"match_kind" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"body" text,
	"citations" jsonb,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_fetch_outcome" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "embedding_hash" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "embedded_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "milestones_entity_criteria_unique" ON "milestones" USING btree ("entity_type","entity_id","criteria_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "source_duplicate_suggestions_pending_pair_unique" ON "source_duplicate_suggestions" USING btree ("source_a_id","source_b_id") WHERE "source_duplicate_suggestions"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_materials_topic_id_created_at_idx" ON "study_materials" USING btree ("topic_id","created_at" DESC NULLS LAST);