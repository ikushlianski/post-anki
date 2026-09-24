ALTER TABLE "knowledge_bits" ADD COLUMN "tagged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "tag_failed_at" timestamp with time zone;