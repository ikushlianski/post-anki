CREATE TABLE IF NOT EXISTS "domain_node_prerequisites" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_node_id" text NOT NULL,
	"prerequisite_node_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_path_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"path_id" text NOT NULL,
	"domain_node_id" text NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_paths" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"target_role_label" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"node_type" text NOT NULL,
	"node_id" text NOT NULL,
	"body" text NOT NULL,
	"is_highlight" boolean DEFAULT false NOT NULL,
	"concern" text,
	"search_vector" "tsvector",
	"last_surfaced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "study_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text,
	"target_id" text,
	"planned_duration_minutes" integer NOT NULL,
	"scheduled_for" timestamp with time zone,
	"status" text DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"questions_answered" integer DEFAULT 0 NOT NULL,
	"questions_correct" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "domain_node_prerequisites_node_prerequisite_unique" ON "domain_node_prerequisites" USING btree ("domain_node_id","prerequisite_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_node_prerequisites_domain_node_id_idx" ON "domain_node_prerequisites" USING btree ("domain_node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_path_steps_path_id_idx" ON "learning_path_steps" USING btree ("path_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_search_vector_idx" ON "notes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notes_node_type_node_id_idx" ON "notes" USING btree ("node_type","node_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "study_sessions_status_scheduled_for_idx" ON "study_sessions" USING btree ("status","scheduled_for");