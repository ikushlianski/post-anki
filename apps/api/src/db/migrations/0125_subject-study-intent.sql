ALTER TABLE "subjects" ADD COLUMN "study_intent" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "exam_date" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "exam_planned_at" timestamp with time zone;