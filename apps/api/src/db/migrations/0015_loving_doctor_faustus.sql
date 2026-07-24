CREATE TABLE IF NOT EXISTS "tag_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_id" text NOT NULL,
	"node_type" text NOT NULL,
	"node_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "probe_sessions" ALTER COLUMN "curriculum_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_assignments_tag_node_unique" ON "tag_assignments" USING btree ("tag_id","node_type","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_normalized_name_unique" ON "tags" USING btree ("normalized_name");