CREATE TABLE IF NOT EXISTS "phrase_bank_appearances" (
	"id" text PRIMARY KEY NOT NULL,
	"phrase_bank_entry_id" text NOT NULL,
	"phrase_id" text NOT NULL,
	"sentence_count" integer NOT NULL,
	"result" text NOT NULL,
	"score" integer NOT NULL,
	"was_overdue" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phrase_bank_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"level" text NOT NULL,
	"pack" text NOT NULL,
	"phrase_text" text NOT NULL,
	"category" text,
	"status" text DEFAULT 'new' NOT NULL,
	"mastery_stage" integer DEFAULT 0 NOT NULL,
	"correct_count_in_cycle" integer DEFAULT 0 NOT NULL,
	"incorrect_count_in_cycle" integer DEFAULT 0 NOT NULL,
	"last_correct_at_sentence_count" integer,
	"last_correct_date" timestamp with time zone,
	"scheduled_for_sentence_count" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"mastered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "phrases" ADD COLUMN "target_phrase_bank_entry_id" text;--> statement-breakpoint
ALTER TABLE "phrases" ADD COLUMN "sequence_number" integer;--> statement-breakpoint
WITH numbered AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "subject_id", "level", "pack" ORDER BY "created_at"
	) AS "row_number"
	FROM "phrases"
)
UPDATE "phrases"
SET "sequence_number" = numbered."row_number"
FROM numbered
WHERE "phrases"."id" = numbered."id";--> statement-breakpoint
ALTER TABLE "phrases" ALTER COLUMN "sequence_number" SET NOT NULL;