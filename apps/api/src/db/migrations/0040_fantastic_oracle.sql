ALTER TABLE "gaps" ADD COLUMN "triage_state" text DEFAULT 'untriaged' NOT NULL;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "deferred_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "deferral_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "dismissed_checkin_sent_at" timestamp with time zone;