CREATE TABLE IF NOT EXISTS "knowledge_source_extraction_grade" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_source_id" text NOT NULL,
	"subject_id" text,
	"model_id" text,
	"run_number" integer NOT NULL,
	"rating" smallint NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_source_extraction_grade_rating_range" CHECK ("knowledge_source_extraction_grade"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "knowledge_bit_feedback" ADD COLUMN "extraction_run" integer;--> statement-breakpoint
ALTER TABLE "knowledge_bit_feedback" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "knowledge_bit_feedback" ADD COLUMN "wording_rating" smallint;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "extraction_run" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_source_extraction_grade_source_run_unique" ON "knowledge_source_extraction_grade" USING btree ("knowledge_source_id","run_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "knowledge_source_extraction_grade_model_idx" ON "knowledge_source_extraction_grade" USING btree ("model_id");--> statement-breakpoint
ALTER TABLE "knowledge_bit_feedback" ADD CONSTRAINT "knowledge_bit_feedback_rating_range" CHECK ("knowledge_bit_feedback"."rating" between 1 and 5);--> statement-breakpoint
ALTER TABLE "knowledge_bit_feedback" ADD CONSTRAINT "knowledge_bit_feedback_wording_rating_range" CHECK ("knowledge_bit_feedback"."wording_rating" between 1 and 5);--> statement-breakpoint
CREATE OR REPLACE VIEW "knowledge_feedback_report" AS
SELECT
	f."id" AS "feedback_id",
	f."created_at" AS "decided_at",
	f."verdict" AS "verdict",
	f."reason_code" AS "reason_code",
	f."note" AS "note",
	f."rating" AS "rating",
	f."wording_rating" AS "wording_rating",
	f."model_id" AS "model_id",
	f."subject_id" AS "subject_id",
	s."name" AS "subject_name",
	f."knowledge_source_id" AS "knowledge_source_id",
	f."knowledge_bit_id" AS "knowledge_bit_id",
	f."extraction_run" AS "extraction_run",
	f."statement" AS "statement",
	f."front" AS "front",
	f."back" AS "back",
	g."rating" AS "extraction_rating",
	g."note" AS "extraction_note"
FROM "knowledge_bit_feedback" f
LEFT JOIN "subjects" s ON s."id" = f."subject_id"
LEFT JOIN "knowledge_source_extraction_grade" g
	ON g."knowledge_source_id" = f."knowledge_source_id" AND g."run_number" = f."extraction_run"
WHERE f."verdict" IN ('approved', 'rejected');
