ALTER TABLE "llm_call_events" ADD COLUMN "purpose" text;--> statement-breakpoint
CREATE INDEX "llm_call_events_created_at_idx" ON "llm_call_events" USING btree ("created_at");
