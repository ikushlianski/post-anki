CREATE TABLE IF NOT EXISTS "knowledge_bits" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_source_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "failure_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_bits_source_id_ordinal_unique" ON "knowledge_bits" USING btree ("knowledge_source_id","ordinal");