ALTER TABLE "knowledge_bit_schedules" ADD COLUMN "phase" text DEFAULT 'review' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bit_schedules" ADD COLUMN "learning_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bit_schedules" ADD COLUMN "lapses" integer DEFAULT 0 NOT NULL;