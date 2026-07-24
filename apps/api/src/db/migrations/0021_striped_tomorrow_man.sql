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
