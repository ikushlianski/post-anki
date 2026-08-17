CREATE TABLE IF NOT EXISTS "learning_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text,
	"raw_text" text,
	"title" text,
	"kind" text NOT NULL,
	"verdict" text,
	"recommendation" text,
	"status" text DEFAULT 'captured' NOT NULL,
	"curriculum_id" text,
	"questions_generated" integer DEFAULT 0 NOT NULL,
	"question_ceiling" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "liveness" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"score" integer NOT NULL,
	"last_activity_at" timestamp with time zone,
	"last_nudge_at" timestamp with time zone,
	"last_nudge_response" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "concern" text;--> statement-breakpoint
ALTER TABLE "domain_nodes" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "concern" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "depth_elected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "available_depth" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_list_items_status_created_at_idx" ON "learning_list_items" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "liveness_entity_unique" ON "liveness" USING btree ("entity_type","entity_id");