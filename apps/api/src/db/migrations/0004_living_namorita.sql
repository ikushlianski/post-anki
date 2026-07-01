CREATE TABLE IF NOT EXISTS "probe_session_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"order" integer NOT NULL,
	"topic_id" text,
	"gap_id" text,
	"prompt" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_answer_index" integer NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"kind" text DEFAULT 'mcq' NOT NULL,
	"answered_index" integer,
	"outcome" text,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "probe_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"answered" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
