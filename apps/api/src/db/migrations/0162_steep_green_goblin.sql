ALTER TABLE "app_settings" ADD COLUMN "triage_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bit_question_variants" ADD COLUMN "card_key" text;--> statement-breakpoint
CREATE INDEX "knowledge_bit_question_variants_card_key_idx" ON "knowledge_bit_question_variants" USING btree ("card_key");
