ALTER TABLE "knowledge_bits" ADD COLUMN "duplicate_reason" text;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "similar_bit_ids" jsonb;