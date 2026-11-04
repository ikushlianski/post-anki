ALTER TABLE "knowledge_bits" ADD COLUMN "ai_suggestion" text;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD COLUMN "import_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_sources_import_key_unique" ON "knowledge_sources" USING btree ("import_key");