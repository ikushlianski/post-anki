CREATE TABLE IF NOT EXISTS "knowledge_bit_schedules" (
	"knowledge_bit_id" text PRIMARY KEY NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	"review_count" integer DEFAULT 0 NOT NULL
);
