CREATE TABLE IF NOT EXISTS "knowledge_bit_question_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"kind" text NOT NULL,
	"order" integer NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"embedding" jsonb,
	"embedding_hash" text,
	"embedded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "wh_question_generated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "wh_question_generation_failed_at" timestamp with time zone;