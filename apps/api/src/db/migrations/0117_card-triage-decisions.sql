CREATE TABLE "card_triage_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"verdict" text NOT NULL,
	"reason_code" text,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_index" integer NOT NULL,
	"ms_since_previous" integer,
	"dwell_ms" integer,
	"subject_id" text,
	"knowledge_source_id" text,
	"extraction_model_id" text,
	"extraction_run" integer,
	"review_flag" text,
	"variants" jsonb,
	"front" text,
	"back" text,
	"undone_at" timestamp with time zone,
	"source" text DEFAULT 'client' NOT NULL,
	"feedback_id" text
);
--> statement-breakpoint
ALTER TABLE "card_triage_sessions" ADD COLUMN "client" text;--> statement-breakpoint
ALTER TABLE "card_triage_sessions" ADD COLUMN "start_key" text;--> statement-breakpoint
ALTER TABLE "card_triage_sessions" ADD COLUMN "ended_by" text;--> statement-breakpoint
ALTER TABLE "card_triage_sessions" ADD COLUMN "undecided_count" integer;--> statement-breakpoint
ALTER TABLE "card_triage_sessions" ADD COLUMN "last_activity_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "card_triage_decisions_session_order_idx" ON "card_triage_decisions" USING btree ("session_id","order_index");--> statement-breakpoint
CREATE INDEX "card_triage_decisions_bit_idx" ON "card_triage_decisions" USING btree ("knowledge_bit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_triage_decisions_live_unique" ON "card_triage_decisions" USING btree ("session_id","knowledge_bit_id") WHERE "card_triage_decisions"."undone_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "card_triage_sessions_start_key_unique" ON "card_triage_sessions" USING btree ("start_key") WHERE "card_triage_sessions"."start_key" is not null;