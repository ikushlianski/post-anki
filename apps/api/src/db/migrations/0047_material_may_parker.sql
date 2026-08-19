ALTER TABLE "app_settings" ADD COLUMN "model_tier" text DEFAULT 'cheap' NOT NULL;--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "model_tier" text;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "model_tier" text;