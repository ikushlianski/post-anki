ALTER TABLE "curricula" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- course-priority-drag-reorder (issue #69) — every pre-existing curriculum
-- row lands at "order" 0 from the ALTER TABLE above; this backfill assigns a
-- distinct sequential value per subject, ascending by created_at, so the
-- first time a learner opens a subject after this ships the order already
-- reflects when each course was originally created (Scenario 6), rather than
-- an arbitrary shuffle of ties.
UPDATE curricula c
SET "order" = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY created_at) AS rn
  FROM curricula
) sub
WHERE c.id = sub.id;