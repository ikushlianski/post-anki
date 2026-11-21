ALTER TABLE "llm_call_events" ADD COLUMN "knowledge_source_id" text;--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "cost_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "cluster_id" text;--> statement-breakpoint
CREATE INDEX "llm_call_events_op_created_at_idx" ON "llm_call_events" USING btree ("op","created_at");