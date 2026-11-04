CREATE TABLE "knowledge_bit_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"knowledge_bit_id" text NOT NULL,
	"seq" integer NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"client_message_id" text,
	"model_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_bits" ADD COLUMN "chat_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "nothing_extracted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bit_chat_messages_bit_seq_unique" ON "knowledge_bit_chat_messages" USING btree ("knowledge_bit_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_bit_chat_messages_bit_client_message_unique" ON "knowledge_bit_chat_messages" USING btree ("knowledge_bit_id","client_message_id");--> statement-breakpoint
CREATE INDEX "knowledge_bits_chat_at_idx" ON "knowledge_bits" USING btree ("chat_at") WHERE "knowledge_bits"."approval_state" = 'chat';