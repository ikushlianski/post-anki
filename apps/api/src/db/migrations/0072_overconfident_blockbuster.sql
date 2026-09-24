ALTER TABLE "knowledge_bits" ADD COLUMN "wh_question_generation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "wh_question_generation_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "wh_question_generation_claim_token" text;