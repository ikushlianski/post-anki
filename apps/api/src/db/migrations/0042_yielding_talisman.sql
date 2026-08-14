CREATE TABLE IF NOT EXISTS "domain_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"domain_node_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"axis" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'structural' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_curriculum_id" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_recommendations_subject_node_unique" ON "domain_recommendations" USING btree ("subject_id","domain_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_recommendations_subject_status_created_idx" ON "domain_recommendations" USING btree ("subject_id","status","created_at" DESC NULLS LAST);