CREATE TABLE IF NOT EXISTS "topic_card_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_card_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"order" integer NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topic_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"card_set_id" text NOT NULL,
	"order" integer NOT NULL,
	"concept" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "topic_card_sets_topic_id_unique" ON "topic_card_sets" USING btree ("topic_id");