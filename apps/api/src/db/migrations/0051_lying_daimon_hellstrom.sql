ALTER TABLE "llm_call_events" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_call_events" ADD COLUMN "total_tokens" integer;