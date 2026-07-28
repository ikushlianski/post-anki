CREATE TABLE IF NOT EXISTS "domain_priority_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_node_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"current_target_depth" text,
	"suggested_target_depth" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'general-knowledge' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "domain_nodes" ADD COLUMN "target_depth" text;