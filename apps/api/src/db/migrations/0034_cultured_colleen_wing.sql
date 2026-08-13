CREATE TABLE IF NOT EXISTS "domain_node_links" (
	"id" text PRIMARY KEY NOT NULL,
	"from_node_id" text NOT NULL,
	"to_node_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "release_state" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "headroom_offered_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_node_links_from_to_kind_unique" ON "domain_node_links" USING btree ("from_node_id","to_node_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_node_links_to_node_id_idx" ON "domain_node_links" USING btree ("to_node_id");