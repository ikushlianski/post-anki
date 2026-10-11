CREATE TABLE IF NOT EXISTS "knowledge_bit_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_source_id" text NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"subject_id" text,
	"model_id" text,
	"verdict" text NOT NULL,
	"reason_code" text,
	"note" text,
	"statement" text NOT NULL,
	"front" text,
	"back" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_feedback_subject_created_idx" ON "knowledge_bit_feedback" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_feedback_model_idx" ON "knowledge_bit_feedback" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_bit_feedback_bit_idx" ON "knowledge_bit_feedback" USING btree ("knowledge_bit_id");