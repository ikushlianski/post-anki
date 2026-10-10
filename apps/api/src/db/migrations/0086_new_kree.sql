ALTER TABLE "knowledge_bits" ADD COLUMN "basic_card_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "basic_card_generation_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "basic_card_generation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "basic_card_generation_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "basic_card_generation_claim_token" text;