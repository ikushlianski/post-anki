CREATE TABLE "notion_import_log" (
	"id" text PRIMARY KEY NOT NULL,
	"connector" text NOT NULL,
	"notion_block_id" text NOT NULL,
	"original_text" text NOT NULL,
	"knowledge_source_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_error" text
);
--> statement-breakpoint
CREATE INDEX "notion_import_log_connector_deleted_idx" ON "notion_import_log" USING btree ("connector","deleted_at");