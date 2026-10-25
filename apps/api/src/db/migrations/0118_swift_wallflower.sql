ALTER TABLE "knowledge_sources" ADD COLUMN "suggested_subject_id" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "suggested_subject_confidence" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "subject_suggestion_checked_at" timestamp with time zone;