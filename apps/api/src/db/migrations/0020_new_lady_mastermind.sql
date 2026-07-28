CREATE TABLE IF NOT EXISTS "writing_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"text" text NOT NULL,
	"score" integer NOT NULL,
	"verdict" text NOT NULL,
	"feedback" text NOT NULL,
	"native_alternatives" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
