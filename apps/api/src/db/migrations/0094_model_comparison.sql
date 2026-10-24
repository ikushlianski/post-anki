CREATE TABLE IF NOT EXISTS "model_comparison_card_grade" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"model_id" text NOT NULL,
	"card_index" integer NOT NULL,
	"rating" smallint,
	"wording_rating" smallint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_comparison_card_grade_rating_range" CHECK ("model_comparison_card_grade"."rating" between 1 and 5),
	CONSTRAINT "model_comparison_card_grade_wording_range" CHECK ("model_comparison_card_grade"."wording_rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_comparison_result" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"model_id" text NOT NULL,
	"status" text NOT NULL,
	"ms" integer NOT NULL,
	"returned" integer NOT NULL,
	"cards" jsonb NOT NULL,
	"dropped" jsonb NOT NULL,
	"error" text,
	"extraction_rating" smallint,
	"extraction_note" text,
	"graded_at" timestamp with time zone,
	CONSTRAINT "model_comparison_result_rating_range" CHECK ("model_comparison_result"."extraction_rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_comparison_run" (
	"id" text PRIMARY KEY NOT NULL,
	"excerpt" text NOT NULL,
	"model_ids" jsonb NOT NULL,
	"estimated_cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_comparison_card_grade_card_unique" ON "model_comparison_card_grade" USING btree ("run_id","model_id","card_index");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_comparison_result_run_model_unique" ON "model_comparison_result" USING btree ("run_id","model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_comparison_result_model_idx" ON "model_comparison_result" USING btree ("model_id");--> statement-breakpoint
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
	r."ms" AS "ms"
FROM "model_comparison_result" r
JOIN "model_comparison_run" run ON run."id" = r."run_id";
