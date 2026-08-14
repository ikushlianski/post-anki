ALTER TABLE "curricula" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;

-- Backfill order: per-subject sequential numbering (1..N), ordered by created_at.
-- Containers (container_area_node_id IS NOT NULL) remain at default 0 and are never touched.
-- Uses a window function to assign row numbers within each subject, ordered by created_at.
UPDATE "curricula" c
SET "order" = ranked."row_num"
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at ASC) AS row_num
  FROM "curricula"
  WHERE "container_area_node_id" IS NULL
) AS ranked
WHERE c.id = ranked.id;