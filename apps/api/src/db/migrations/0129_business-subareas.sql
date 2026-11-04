INSERT INTO "subjects" ("id", "name", "parent_id")
SELECT 'sub_' || gen_random_uuid()::text, sub.name, business.id
FROM (
  SELECT "id" FROM "subjects"
  WHERE "name" = 'Business' AND "parent_id" IS NULL
  ORDER BY "created_at", "id"
  LIMIT 1
) AS business
CROSS JOIN (
  VALUES ('Networking'), ('Finance'), ('Leadership'), ('Strategy'), ('Product'), ('Entrepreneurship'), ('Operations'), ('Customer Success')
) AS sub("name")
WHERE NOT EXISTS (
  SELECT 1 FROM "subjects" AS existing
  WHERE existing."name" = sub.name AND existing."parent_id" = business.id
);
