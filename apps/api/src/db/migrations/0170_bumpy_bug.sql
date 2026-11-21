CREATE TABLE "synthesis_mining_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"bit_ids" jsonb NOT NULL,
	"evidence_bit_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_link" jsonb,
	"outcome" text NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthesis_mining_examined_bits" (
	"id" text PRIMARY KEY NOT NULL,
	"bit_id" text NOT NULL,
	"run_id" text NOT NULL,
	"cluster_id" text,
	"outcome" text NOT NULL,
	"examined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "synthesis_mining_clusters_run_idx" ON "synthesis_mining_clusters" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synthesis_mining_examined_bits_bit_unique" ON "synthesis_mining_examined_bits" USING btree ("bit_id");--> statement-breakpoint
CREATE INDEX "synthesis_mining_examined_bits_run_idx" ON "synthesis_mining_examined_bits" USING btree ("run_id");