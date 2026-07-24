CREATE TABLE IF NOT EXISTS "socratic_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "socratic_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"gap_id" text,
	"concept_label" text NOT NULL,
	"order" integer NOT NULL,
	"prompt" text NOT NULL,
	"answer" text,
	"degree" text,
	"action" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
