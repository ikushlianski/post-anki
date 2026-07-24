CREATE TABLE IF NOT EXISTS "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"phrase_id" text NOT NULL,
	"user_answer" text NOT NULL,
	"score" integer NOT NULL,
	"verdict" text NOT NULL,
	"feedback" text NOT NULL,
	"native_alternatives" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "language_practice_settings" (
	"subject_id" text PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'B1_B2' NOT NULL,
	"pack" text DEFAULT 'General' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phrases" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"level" text NOT NULL,
	"pack" text NOT NULL,
	"position" integer NOT NULL,
	"russian" text NOT NULL,
	"reference_english" text NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
