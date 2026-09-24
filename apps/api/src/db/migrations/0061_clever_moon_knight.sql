ALTER TABLE "knowledge_bits" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "embedding_hash" text;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "embedded_at" timestamp with time zone;