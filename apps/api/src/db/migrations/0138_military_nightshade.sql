CREATE TABLE "connector_secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped_existing" integer DEFAULT 0 NOT NULL,
	"ignored" integer DEFAULT 0 NOT NULL,
	"removed" integer DEFAULT 0 NOT NULL,
	"remove_failed" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notion_ingestion_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"page_id" text NOT NULL,
	"page_url" text NOT NULL,
	"subject_id" text NOT NULL,
	"pipeline" text DEFAULT 'meeting_phrases' NOT NULL,
	"items_per_run" integer NOT NULL,
	"frequency" text NOT NULL,
	"remove_after_import" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_ingestion_sources_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
ALTER TABLE "notion_ingestion_runs" ADD CONSTRAINT "notion_ingestion_runs_source_id_notion_ingestion_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."notion_ingestion_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_ingestion_sources" ADD CONSTRAINT "notion_ingestion_sources_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;