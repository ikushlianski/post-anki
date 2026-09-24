CREATE TABLE IF NOT EXISTS "knowledge_bit_variant_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"variant_id" text NOT NULL,
	"user_answer" text NOT NULL,
	"score" integer NOT NULL,
	"verdict" text NOT NULL,
	"feedback" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
