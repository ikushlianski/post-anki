ALTER TABLE "knowledge_bits" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "body")) STORED;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "title")) STORED;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "title" || ' ' || coalesce("summary", ''))) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bits_search_vector_idx" ON "knowledge_bits" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "modules_search_vector_idx" ON "modules" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_search_vector_idx" ON "topics" USING gin ("search_vector");