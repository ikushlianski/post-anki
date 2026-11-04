ALTER TABLE "app_settings" ADD COLUMN "learning_steps_minutes" jsonb DEFAULT '[1,10]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "relearning_steps_minutes" jsonb DEFAULT '[10]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "desired_retention" real DEFAULT 0.9 NOT NULL;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "new_cards_per_day" integer;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "learning_steps_minutes" jsonb;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "relearning_steps_minutes" jsonb;--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "desired_retention" real;