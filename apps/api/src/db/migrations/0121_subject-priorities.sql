CREATE TABLE "subject_priorities" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"period_kind" text NOT NULL,
	"period_key" text NOT NULL,
	"title" text NOT NULL,
	"target_metric" text DEFAULT 'none' NOT NULL,
	"target_value" integer,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "subject_priorities_period_idx" ON "subject_priorities" USING btree ("subject_id","period_kind","period_key");