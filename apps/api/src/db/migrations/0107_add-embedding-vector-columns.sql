ALTER TABLE "facts" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
ALTER TABLE "knowledge_bit_question_variants" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
ALTER TABLE "topic_card_variants" ADD COLUMN "embedding_vec" vector(1536);--> statement-breakpoint
UPDATE "facts" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
UPDATE "knowledge_bit_question_variants" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
UPDATE "knowledge_bits" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
UPDATE "sources" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
UPDATE "subjects" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
UPDATE "topic_card_variants" SET "embedding_vec" = ("embedding"::text)::vector WHERE "embedding" IS NOT NULL AND jsonb_typeof("embedding") = 'array' AND jsonb_array_length("embedding") = 1536;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facts_embedding_vec_hnsw_idx" ON "facts" USING hnsw ("embedding_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_question_variants_embedding_vec_hnsw_idx" ON "knowledge_bit_question_variants" USING hnsw ("embedding_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bits_embedding_vec_hnsw_idx" ON "knowledge_bits" USING hnsw ("embedding_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sources_embedding_vec_hnsw_idx" ON "sources" USING hnsw ("embedding_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subjects_embedding_vec_hnsw_idx" ON "subjects" USING hnsw ("embedding_vec" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_card_variants_embedding_vec_hnsw_idx" ON "topic_card_variants" USING hnsw ("embedding_vec" vector_cosine_ops);
