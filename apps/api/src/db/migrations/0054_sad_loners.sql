CREATE TABLE IF NOT EXISTS "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" jsonb,
	"embedding_hash" text,
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facts_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notion_sync_items" (
	"notion_id" text PRIMARY KEY NOT NULL,
	"connector" text NOT NULL,
	"destination" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
