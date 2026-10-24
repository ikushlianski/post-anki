ALTER TABLE "model_comparison_result" ADD COLUMN "input_tokens" integer;--> statement-breakpoint
ALTER TABLE "model_comparison_result" ADD COLUMN "output_tokens" integer;--> statement-breakpoint
ALTER TABLE "model_comparison_result" ADD COLUMN "actual_cost_usd" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "model_comparison_result" ADD COLUMN "estimated_cost_usd" numeric(10, 6);--> statement-breakpoint
CREATE OR REPLACE VIEW "model_comparison_report" AS
SELECT
	r."run_id" AS "run_id",
	run."created_at" AS "created_at",
	r."model_id" AS "model_id",
	r."status" AS "status",
	r."extraction_rating" AS "extraction_rating",
	r."extraction_note" AS "extraction_note",
	(SELECT avg(g."rating")::real FROM "model_comparison_card_grade" g WHERE g."run_id" = r."run_id" AND g."model_id" = r."model_id") AS "average_card_quality",
	(SELECT avg(g."wording_rating")::real FROM "model_comparison_card_grade" g WHERE g."run_id" = r."run_id" AND g."model_id" = r."model_id") AS "average_question_wording",
	jsonb_array_length(r."cards") AS "cards_kept",
	r."returned" AS "cards_returned",
	r."ms" AS "ms",
	r."input_tokens" AS "input_tokens",
	r."output_tokens" AS "output_tokens",
	r."actual_cost_usd" AS "actual_cost_usd",
	r."estimated_cost_usd" AS "estimated_cost_usd"
FROM "model_comparison_result" r
JOIN "model_comparison_run" run ON run."id" = r."run_id";
