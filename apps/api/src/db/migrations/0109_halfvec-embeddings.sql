DROP INDEX IF EXISTS "knowledge_bit_question_variants_embedding_vec_hnsw_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "facts_embedding_vec_hnsw_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "knowledge_bits_embedding_vec_hnsw_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "topic_card_variants_embedding_vec_hnsw_idx";--> statement-breakpoint
ALTER TABLE "facts" ALTER COLUMN "embedding_vec" SET DATA TYPE halfvec(1536);--> statement-breakpoint
ALTER TABLE "knowledge_bit_question_variants" ALTER COLUMN "embedding_vec" SET DATA TYPE halfvec(1536);--> statement-breakpoint
ALTER TABLE "knowledge_bits" ALTER COLUMN "embedding_vec" SET DATA TYPE halfvec(1536);--> statement-breakpoint
ALTER TABLE "topic_card_variants" ALTER COLUMN "embedding_vec" SET DATA TYPE halfvec(1536);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facts_embedding_vec_hnsw_idx" ON "facts" USING hnsw ("embedding_vec" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bits_embedding_vec_hnsw_idx" ON "knowledge_bits" USING hnsw ("embedding_vec" halfvec_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_card_variants_embedding_vec_hnsw_idx" ON "topic_card_variants" USING hnsw ("embedding_vec" halfvec_cosine_ops);