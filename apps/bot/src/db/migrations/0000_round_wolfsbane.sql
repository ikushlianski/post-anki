CREATE TABLE IF NOT EXISTS "pending_probe" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"gap_id" text,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
