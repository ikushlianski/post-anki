CREATE TABLE IF NOT EXISTS "card_style_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text,
	"session_id" text,
	"text" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_triage_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"feedback_text" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_style_notes_subject_superseded_idx" ON "card_style_notes" USING btree ("subject_id","superseded_at");