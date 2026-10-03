CREATE TABLE IF NOT EXISTS "biz_education_distill_failures" (
	"source_ref" text PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_failed_at" timestamp with time zone
);
