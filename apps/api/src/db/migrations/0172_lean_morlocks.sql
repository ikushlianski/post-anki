ALTER TABLE "subjects" ADD COLUMN "new_card_order" text;--> statement-breakpoint
UPDATE "subjects" SET "new_card_order" = 'newest-first' WHERE "name" = 'English' AND "parent_id" IS NULL;
