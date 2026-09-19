ALTER TABLE "topic_card_variants" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "topic_card_variants" ADD COLUMN "embedding_hash" text;--> statement-breakpoint
ALTER TABLE "topic_card_variants" ADD COLUMN "embedded_at" timestamp with time zone;