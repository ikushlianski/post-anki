CREATE TABLE IF NOT EXISTS "node_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"node_type" text NOT NULL,
	"node_id" text NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curricula" ADD COLUMN "strict_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "modules" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;