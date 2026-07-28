CREATE TABLE IF NOT EXISTS "domain_supersession_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"domain_node_id" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'doc-scan' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "domain_topic_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"proposed_parent_node_id" text,
	"proposed_node_name" text NOT NULL,
	"reason" text NOT NULL,
	"source" text DEFAULT 'doc-scan' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_domain_node_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tracked_tool_scan_state" (
	"tool_key" text PRIMARY KEY NOT NULL,
	"last_content_hash" text,
	"last_scanned_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "domain_nodes" ADD COLUMN "superseded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain_nodes" ADD COLUMN "superseded_reason" text;