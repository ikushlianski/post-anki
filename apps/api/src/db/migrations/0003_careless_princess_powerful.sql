ALTER TABLE "subjects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "require_sources" boolean DEFAULT false NOT NULL;