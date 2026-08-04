CREATE TABLE IF NOT EXISTS "curriculum_domain_node_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"domain_node_id" text NOT NULL,
	"depth" text,
	"status" text DEFAULT 'suggested' NOT NULL,
	"source" text DEFAULT 'ai_suggested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "domain_nodes" ADD COLUMN "source" text DEFAULT 'ai_generated' NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_domain_node_mappings_domain_node_id_status_idx" ON "curriculum_domain_node_mappings" USING btree ("domain_node_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_domain_node_mappings_curriculum_id_idx" ON "curriculum_domain_node_mappings" USING btree ("curriculum_id");--> statement-breakpoint
-- decouple-curricula-from-domain-nodes (issue #84), SCENARIO 10 — backfill
-- every pre-existing curricula.domain_node_id value into one pre-confirmed
-- mapping row BEFORE the column is dropped below, so no curriculum's
-- placement is lost. source: 'auto', not 'manual' — every value ever
-- written to this column came from resolveDomainPlacement (including its
-- own explicit-placement Path 1), never from a direct write this ticket's
-- new 'manual' label would correctly describe. resolved_at is backfilled
-- to created_at (the closest available approximation of when that
-- placement actually happened, rather than leaving it null on an otherwise
-- already-confirmed row).
INSERT INTO "curriculum_domain_node_mappings" ("id", "curriculum_id", "domain_node_id", "depth", "status", "source", "created_at", "resolved_at")
SELECT 'cdnm_' || gen_random_uuid()::text, "id", "domain_node_id", NULL, 'confirmed', 'auto', "created_at", "created_at"
FROM "curricula"
WHERE "domain_node_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "curricula" DROP COLUMN IF EXISTS "domain_node_id";