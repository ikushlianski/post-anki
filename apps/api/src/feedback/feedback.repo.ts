import { and, desc, eq } from "drizzle-orm";
import type { ItemFeedback, ItemFeedbackRating, ItemFeedbackType } from "@post-anki/shared";
import type { FeedbackRow } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { studyItemFeedback } from "../db/schema.js";
import { newId } from "../shared/id.js";

function rowToItemFeedback(row: typeof studyItemFeedback.$inferSelect): ItemFeedback {
  return {
    id: row.id,
    itemType: row.itemType as ItemFeedbackType,
    itemId: row.itemId,
    topicId: row.topicId,
    itemText: row.itemText,
    rating: row.rating as ItemFeedbackRating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getItemFeedback(
  itemType: ItemFeedbackType,
  itemId: string,
): Promise<ItemFeedback | null> {
  const rows = await getDb()
    .select()
    .from(studyItemFeedback)
    .where(
      and(eq(studyItemFeedback.itemType, itemType), eq(studyItemFeedback.itemId, itemId)),
    );

  return rows[0] ? rowToItemFeedback(rows[0]) : null;
}

export async function upsertItemFeedback(input: {
  itemType: ItemFeedbackType;
  itemId: string;
  topicId: string | null;
  itemText: string;
  rating: ItemFeedbackRating;
  comment: string | null;
}): Promise<ItemFeedback> {
  const db = getDb();
  const existing = await getItemFeedback(input.itemType, input.itemId);
  const now = new Date();

  if (existing) {
    await db
      .update(studyItemFeedback)
      .set({
        topicId: input.topicId,
        itemText: input.itemText,
        rating: input.rating,
        comment: input.comment,
        updatedAt: now,
      })
      .where(eq(studyItemFeedback.id, existing.id));

    return {
      ...existing,
      topicId: input.topicId,
      itemText: input.itemText,
      rating: input.rating,
      comment: input.comment,
      updatedAt: now.toISOString(),
    };
  }

  const row = {
    id: newId("fbk"),
    itemType: input.itemType,
    itemId: input.itemId,
    topicId: input.topicId,
    itemText: input.itemText,
    rating: input.rating,
    comment: input.comment,
  };

  await db.insert(studyItemFeedback).values(row);

  return rowToItemFeedback({ ...row, createdAt: now, updatedAt: now });
}

export async function getFeedbackForTopic(topicId: string): Promise<FeedbackRow[]> {
  const rows = await getDb()
    .select()
    .from(studyItemFeedback)
    .where(eq(studyItemFeedback.topicId, topicId))
    .orderBy(desc(studyItemFeedback.updatedAt));

  return rows.map((row) => ({
    rating: row.rating as ItemFeedbackRating,
    comment: row.comment,
    itemText: row.itemText,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
