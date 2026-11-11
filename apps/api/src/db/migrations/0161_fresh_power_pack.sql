ALTER TABLE "knowledge_sources" ADD COLUMN "text_key" text;--> statement-breakpoint
CREATE INDEX "knowledge_sources_text_key_idx" ON "knowledge_sources" USING btree ("text_key");
--> statement-breakpoint
UPDATE "knowledge_sources"
   SET "text_key" = lower(btrim(regexp_replace(
         regexp_replace("raw_text", '\{\{c[0-9]+?::(.*?)(::.*?)?\}\}', '\1', 'g'),
         '\s+', ' ', 'g')))
 WHERE "import_key" LIKE 'anki:%' AND "raw_text" IS NOT NULL;
