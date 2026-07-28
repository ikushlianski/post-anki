CREATE TABLE IF NOT EXISTS "decide_blind_spots" (
	"id" text PRIMARY KEY NOT NULL,
	"decide_session_id" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'decide' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "decide_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"opinion" text NOT NULL,
	"verdict" text NOT NULL,
	"strengths" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
