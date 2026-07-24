CREATE TABLE IF NOT EXISTS "curriculum_structure_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"role" text NOT NULL,
	"message" text NOT NULL,
	"structure_snapshot" jsonb,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
