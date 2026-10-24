INSERT INTO "subjects" ("id", "name", "kind", "require_sources", "parent_id", "sort_order")
SELECT 'sub_' || gen_random_uuid()::text, 'Common', p."kind", p."require_sources", p."id",
  COALESCE((SELECT max(c."sort_order") FROM "subjects" c WHERE c."parent_id" = p."id"), 0) + 1
FROM "subjects" p
WHERE EXISTS (SELECT 1 FROM "subjects" c WHERE c."parent_id" = p."id")
  AND EXISTS (SELECT 1 FROM "knowledge_sources" ks WHERE ks."subject_id" = p."id")
  AND NOT EXISTS (SELECT 1 FROM "subjects" c WHERE c."parent_id" = p."id" AND c."name" = 'Common');
--> statement-breakpoint
UPDATE "knowledge_sources" ks
SET "subject_id" = (
  SELECT c."id" FROM "subjects" c
  WHERE c."parent_id" = ks."subject_id" AND c."name" = 'Common'
  ORDER BY c."id" LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM "subjects" c WHERE c."parent_id" = ks."subject_id" AND c."name" = 'Common');
