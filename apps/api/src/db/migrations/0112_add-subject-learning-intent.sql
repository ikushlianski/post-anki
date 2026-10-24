ALTER TABLE "subjects" ADD COLUMN "learning_intent" text;
--> statement-breakpoint
UPDATE "subjects" SET "learning_intent" = 'Learn transferable business principles: how markets, money, customers and decisions work, and what to do differently because of them. Skip personal biography, anecdotes, dates and names of the author unless they are the point.' WHERE "name" = 'Business' AND "parent_id" IS NULL AND "learning_intent" IS NULL;
