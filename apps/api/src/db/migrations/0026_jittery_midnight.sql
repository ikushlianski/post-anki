CREATE TABLE IF NOT EXISTS "ontology_merges" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"source_id" text NOT NULL,
	"source_name" text NOT NULL,
	"reassigned_counts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ontology_merges_created_at_idx" ON "ontology_merges" USING btree ("created_at" DESC NULLS LAST);