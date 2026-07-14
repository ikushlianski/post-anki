CREATE TABLE IF NOT EXISTS "chat_context" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"session_id" text,
	"current_item_id" text,
	"scope_kind" text,
	"scope_id" text,
	"nav_curriculum_id" text,
	"label" text,
	"message_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
