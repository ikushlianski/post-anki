CREATE TABLE IF NOT EXISTS "llm_daily_spend" (
	"day" text PRIMARY KEY NOT NULL,
	"spent_usd" numeric(14, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
