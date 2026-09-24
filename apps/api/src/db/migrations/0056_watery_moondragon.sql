CREATE TABLE IF NOT EXISTS "knowledge_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"raw_text" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
