ALTER TABLE "knowledge_bits" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "placement_suggestion" text;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "placement_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "placement_failed_at" timestamp with time zone;