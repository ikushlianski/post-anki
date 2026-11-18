CREATE TABLE "card_subject_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"knowledge_source_id" text NOT NULL,
	"suggested_subject_id" text,
	"confidence" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "card_subject_suggestions_bit_unique" ON "card_subject_suggestions" USING btree ("knowledge_bit_id");--> statement-breakpoint
CREATE INDEX "card_subject_suggestions_status_idx" ON "card_subject_suggestions" USING btree ("status","created_at");