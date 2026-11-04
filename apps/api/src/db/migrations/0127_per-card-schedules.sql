-- Per-card schedules: cloze gaps and list steps get their own schedule row.
-- Rollback (manual): copy the most recently reviewed card row of each note back onto its '' row,
-- delete rows with card_key <> '', restore PRIMARY KEY (knowledge_bit_id), drop the view,
-- the two indexes and the card_key / buried_siblings columns.
ALTER TABLE "knowledge_bit_schedules" ADD COLUMN "card_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bit_schedules" DROP CONSTRAINT "knowledge_bit_schedules_pkey";--> statement-breakpoint
ALTER TABLE "knowledge_bit_schedules" ADD CONSTRAINT "knowledge_bit_schedules_knowledge_bit_id_card_key_pk" PRIMARY KEY("knowledge_bit_id","card_key");--> statement-breakpoint
CREATE INDEX "knowledge_bit_schedules_bit_idx" ON "knowledge_bit_schedules" USING btree ("knowledge_bit_id");--> statement-breakpoint
ALTER TABLE "knowledge_bit_reviews" ADD COLUMN "card_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_bit_reviews" ADD COLUMN "buried_siblings" jsonb;--> statement-breakpoint
CREATE INDEX "knowledge_bit_reviews_bit_card_reviewed_idx" ON "knowledge_bit_reviews" USING btree ("knowledge_bit_id","card_key","reviewed_at");--> statement-breakpoint
UPDATE "knowledge_bit_reviews" r SET "card_key" = v."kind" || ':' || v."order"
FROM "knowledge_bit_question_variants" v
WHERE v."id" = r."variant_id" AND v."kind" IN ('cloze', 'list_step', 'list_next', 'list_overview');--> statement-breakpoint
CREATE VIEW "knowledge_bit_cards" AS
SELECT DISTINCT v."knowledge_bit_id" AS "knowledge_bit_id",
  CASE WHEN v."kind" IN ('cloze', 'list_step', 'list_next', 'list_overview') THEN v."kind" || ':' || v."order" ELSE '' END AS "card_key"
FROM "knowledge_bit_question_variants" v
WHERE v."superseded_at" IS NULL;--> statement-breakpoint
CREATE VIEW "knowledge_bit_note_schedules" AS
SELECT u."knowledge_bit_id" AS "knowledge_bit_id",
  (array_agg(u."ease_factor" ORDER BY u."lead_rank", u."due_at", u."card_key") FILTER (WHERE u."has_row"))[1] AS "ease_factor",
  (array_agg(u."interval_days" ORDER BY u."lead_rank", u."due_at", u."card_key") FILTER (WHERE u."has_row"))[1] AS "interval_days",
  (array_agg(u."due_at" ORDER BY u."lead_rank", u."due_at", u."card_key") FILTER (WHERE u."has_row"))[1] AS "due_at",
  max(u."last_reviewed_at") AS "last_reviewed_at",
  coalesce(sum(u."review_count"), 0)::integer AS "review_count",
  (array_agg(u."phase" ORDER BY u."lead_rank", u."due_at", u."card_key") FILTER (WHERE u."has_row"))[1] AS "phase",
  (array_agg(u."learning_step" ORDER BY u."lead_rank", u."due_at", u."card_key") FILTER (WHERE u."has_row"))[1] AS "learning_step",
  coalesce(max(u."lapses"), 0)::integer AS "lapses",
  CASE WHEN bool_and(u."suspended_at" IS NOT NULL) THEN max(u."suspended_at") END AS "suspended_at",
  CASE WHEN bool_and(u."suspended_at" IS NOT NULL OR u."buried_until" IS NOT NULL)
    THEN coalesce(min(u."buried_until") FILTER (WHERE u."suspended_at" IS NULL), min(u."buried_until")) END AS "buried_until"
FROM (
  SELECT c."knowledge_bit_id", c."card_key", s."knowledge_bit_id" IS NOT NULL AS "has_row",
    s."ease_factor", s."interval_days", s."due_at", s."last_reviewed_at", s."review_count", s."phase", s."learning_step", s."lapses", s."suspended_at", s."buried_until",
    CASE WHEN s."suspended_at" IS NOT NULL THEN 2 WHEN s."review_count" = 0 THEN 1 ELSE 0 END AS "lead_rank"
  FROM "knowledge_bit_cards" c
  LEFT JOIN "knowledge_bit_schedules" s ON s."knowledge_bit_id" = c."knowledge_bit_id" AND s."card_key" = c."card_key"
) u
GROUP BY u."knowledge_bit_id"
HAVING bool_or(u."has_row");--> statement-breakpoint
INSERT INTO "knowledge_bit_schedules" ("knowledge_bit_id", "card_key", "ease_factor", "interval_days", "due_at", "last_reviewed_at", "review_count", "phase", "learning_step", "lapses", "suspended_at", "buried_until")
SELECT s."knowledge_bit_id", c."card_key", s."ease_factor", s."interval_days", s."due_at", s."last_reviewed_at", s."review_count", s."phase", s."learning_step", s."lapses", s."suspended_at", s."buried_until"
FROM "knowledge_bit_schedules" s
JOIN "knowledge_bit_cards" c ON c."knowledge_bit_id" = s."knowledge_bit_id" AND c."card_key" <> ''
WHERE s."card_key" = ''
ON CONFLICT DO NOTHING;
