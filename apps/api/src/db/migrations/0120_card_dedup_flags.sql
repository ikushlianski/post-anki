ALTER TABLE "knowledge_bits" ADD COLUMN "duplicate_of_bit_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "duplicate_similarity" real;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "duplicate_checked_at" timestamp with time zone;