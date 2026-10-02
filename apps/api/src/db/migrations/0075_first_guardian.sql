CREATE TABLE IF NOT EXISTS "notion_connector_runs" (
	"connector" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone NOT NULL
);
