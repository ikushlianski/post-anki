CREATE TABLE IF NOT EXISTS "gap_archetype_state" (
	"id" text PRIMARY KEY NOT NULL,
	"gap_id" text NOT NULL,
	"applicable_archetypes" jsonb,
	"archetype_last_used_at" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "socratic_turns" ADD COLUMN "archetype" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gap_archetype_state_gap_id_unique" ON "gap_archetype_state" USING btree ("gap_id");