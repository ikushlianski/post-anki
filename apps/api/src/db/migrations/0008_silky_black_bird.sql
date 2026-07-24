ALTER TABLE "probe_session_questions" ADD COLUMN "type" text DEFAULT 'single' NOT NULL;--> statement-breakpoint
ALTER TABLE "probe_session_questions" ADD COLUMN "correct_answer_indexes" jsonb;--> statement-breakpoint
ALTER TABLE "probe_session_questions" ADD COLUMN "answered_indexes" jsonb;