CREATE TABLE IF NOT EXISTS "knowledge_bit_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"grade" text NOT NULL,
	"was_new" boolean NOT NULL,
	"duration_ms" integer,
	"prev_schedule" jsonb,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_reviews_bit_reviewed_at_idx" ON "knowledge_bit_reviews" USING btree ("knowledge_bit_id","reviewed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_reviews_variant_idx" ON "knowledge_bit_reviews" USING btree ("variant_id");