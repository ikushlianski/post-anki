ALTER TABLE "knowledge_sources" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "sort_order" integer;