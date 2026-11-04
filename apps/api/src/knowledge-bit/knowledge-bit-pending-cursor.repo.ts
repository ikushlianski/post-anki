import { sql } from "drizzle-orm";
import type { PendingReviewCursor } from "@post-anki/shared";
import { knowledgeBits } from "../db/schema.js";

export const pendingReviewCreatedAtText = sql<string>`to_char(${knowledgeBits.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function pendingReviewCursorFilter(cursor?: PendingReviewCursor) {
  if (!cursor) {
    return undefined;
  }

  return sql`(${knowledgeBits.createdAt}, ${knowledgeBits.id}) > (${cursor.afterCreatedAt}::timestamptz, ${cursor.afterId})`;
}
