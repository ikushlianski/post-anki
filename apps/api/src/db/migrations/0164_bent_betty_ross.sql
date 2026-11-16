CREATE TABLE "knowledge_bit_reworded_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"angle" text NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" text,
	"decided_at" timestamp with time zone,
	"variant_id" text
);
--> statement-breakpoint
ALTER TABLE "knowledge_bit_reworded_drafts" ADD CONSTRAINT "knowledge_bit_reworded_drafts_knowledge_bit_id_knowledge_bits_id_fk" FOREIGN KEY ("knowledge_bit_id") REFERENCES "public"."knowledge_bits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_bit_reworded_drafts" ADD CONSTRAINT "knowledge_bit_reworded_drafts_variant_id_knowledge_bit_question_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."knowledge_bit_question_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_bit_reworded_drafts_bit_idx" ON "knowledge_bit_reworded_drafts" USING btree ("knowledge_bit_id");