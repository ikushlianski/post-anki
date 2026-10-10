-- Nests the existing subject tree under its parents. Every statement is a no-op
-- when its parent subject is absent, touches only the named subjects, and deletes nothing.
-- The parent is the earliest-created subject with the exact name, so duplicates resolve deterministically.

UPDATE "subjects" AS child
SET "parent_id" = parent.id
FROM (
  SELECT "id" FROM "subjects"
  WHERE "name" = 'Programming / Web Development'
  ORDER BY "created_at", "id"
  LIMIT 1
) AS parent
WHERE child."name" IN ('Databases', 'Architecture', 'AI', 'Cloud Computing')
  AND child."id" <> parent.id
  AND child."parent_id" IS DISTINCT FROM parent.id;--> statement-breakpoint
INSERT INTO "subjects" ("id", "name", "parent_id")
SELECT 'sub_' || gen_random_uuid()::text, sub.name, business.id
FROM (
  SELECT "id" FROM "subjects"
  WHERE "name" = 'Business'
  ORDER BY "created_at", "id"
  LIMIT 1
) AS business
CROSS JOIN (
  VALUES ('Time management'), ('Sales'), ('SMM'), ('Negotiations'), ('HR'), ('Marketing')
) AS sub("name")
WHERE NOT EXISTS (
  SELECT 1 FROM "subjects" AS existing
  WHERE existing."name" = sub.name AND existing."parent_id" = business.id
);
