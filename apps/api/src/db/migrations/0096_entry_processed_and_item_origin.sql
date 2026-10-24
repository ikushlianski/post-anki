ALTER TABLE "knowledge_bits" ADD COLUMN "origin" text DEFAULT 'extracted' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "processed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD CONSTRAINT "knowledge_bits_origin_check" CHECK ("knowledge_bits"."origin" in ('extracted', 'manual'));--> statement-breakpoint
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
WHERE f."verdict" IN ('approved', 'rejected')
	AND NOT EXISTS (
		SELECT 1 FROM "knowledge_bits" b
		WHERE b."id" = f."knowledge_bit_id" AND b."origin" = 'manual'
	);
