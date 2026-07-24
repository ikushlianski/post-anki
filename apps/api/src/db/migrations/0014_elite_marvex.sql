CREATE TABLE IF NOT EXISTS "curriculum_structure_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"structure_snapshot" jsonb,
	"split_suggestion" jsonb,
	"tool_actions" jsonb,
	"status" text DEFAULT 'complete' NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_call_events" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text,
	"op" text NOT NULL,
	"agent_key" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "structure_research_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"structure_turn_id" text,
	"label" text NOT NULL,
	"title" text NOT NULL,
	"value" text NOT NULL,
	"approval_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "curricula" ADD COLUMN "pre_assessment_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "probe_sessions" ADD COLUMN "replenishing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "approval_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_structure_turns_pending_assistant_unique" ON "curriculum_structure_turns" USING btree ("curriculum_id") WHERE "curriculum_structure_turns"."role" = 'assistant' AND "curriculum_structure_turns"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tag_assignments_tag_node_unique" ON "tag_assignments" USING btree ("tag_id","node_type","node_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tags_normalized_name_unique" ON "tags" USING btree ("normalized_name");