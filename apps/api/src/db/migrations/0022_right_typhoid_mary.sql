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
