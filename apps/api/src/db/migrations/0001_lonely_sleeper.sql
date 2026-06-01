ALTER TABLE "curricula" ADD COLUMN "speed" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "hinting" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "default_depth" text DEFAULT 'working' NOT NULL;