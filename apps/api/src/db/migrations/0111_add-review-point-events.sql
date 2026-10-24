CREATE TABLE IF NOT EXISTS "review_point_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text DEFAULT 'review' NOT NULL,
	"review_id" text NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"subject_id" text,
	"awarded_day" text NOT NULL,
	"points" integer NOT NULL,
	"reason" text NOT NULL,
	"interval_days_after" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	CONSTRAINT "review_point_events_review_id_unique" UNIQUE("review_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_point_events_bit_day_idx" ON "review_point_events" USING btree ("knowledge_bit_id","awarded_day");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_point_events_subject_idx" ON "review_point_events" USING btree ("subject_id");