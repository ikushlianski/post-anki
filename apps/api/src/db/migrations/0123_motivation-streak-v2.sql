CREATE TABLE "motivation_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"time_zone" text,
	"streak_min_reviews" integer DEFAULT 5 NOT NULL,
	"rest_days_per_month" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "rest_dates" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "paused_until" text;--> statement-breakpoint
ALTER TABLE "user_streaks" ADD COLUMN "last_broken_streak" integer DEFAULT 0 NOT NULL;