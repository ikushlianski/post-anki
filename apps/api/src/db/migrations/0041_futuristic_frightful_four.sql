ALTER TABLE "gaps" ADD COLUMN "untriaged_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "gaps" ADD COLUMN "auto_deferred_at" timestamp with time zone;