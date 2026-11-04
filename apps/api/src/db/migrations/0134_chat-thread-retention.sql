ALTER TABLE "knowledge_bits" ADD COLUMN "decided_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "knowledge_bits" SET "decided_at" = now() WHERE "approval_state" IN ('approved', 'rejected');
