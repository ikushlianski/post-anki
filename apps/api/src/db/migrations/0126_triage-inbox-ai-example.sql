ALTER TABLE "knowledge_bits" ADD COLUMN "inbox_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "example_ai_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "example_ai_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "knowledge_bits_inbox_at_idx" ON "knowledge_bits" USING btree ("inbox_at") WHERE "knowledge_bits"."approval_state" = 'inbox';