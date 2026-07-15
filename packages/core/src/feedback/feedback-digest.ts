const MAX_DOWN_ROWS = 10;
const MAX_UP_WITH_COMMENT_ROWS = 5;
const ITEM_TEXT_TRUNCATE_LENGTH = 80;

export interface FeedbackRow {
  rating: "up" | "down";
  comment: string | null;
  itemText: string;
  updatedAt: string;
}

function truncate(text: string): string {
  if (text.length <= ITEM_TEXT_TRUNCATE_LENGTH) {
    return text;
  }

  return `${text.slice(0, ITEM_TEXT_TRUNCATE_LENGTH)}…`;
}

function hasComment(row: FeedbackRow): boolean {
  return row.comment !== null && row.comment.trim().length > 0;
}

export function selectRecentFeedback(rows: FeedbackRow[]): FeedbackRow[] {
  const byRecencyDesc = (a: FeedbackRow, b: FeedbackRow) =>
    b.updatedAt.localeCompare(a.updatedAt);

  const downRows = rows
    .filter((r) => r.rating === "down")
    .sort(byRecencyDesc)
    .slice(0, MAX_DOWN_ROWS);

  const upWithCommentRows = rows
    .filter((r) => r.rating === "up" && hasComment(r))
    .sort(byRecencyDesc)
    .slice(0, MAX_UP_WITH_COMMENT_ROWS);

  return [...downRows, ...upWithCommentRows].sort(byRecencyDesc);
}

export function buildFeedbackDigest(rows: FeedbackRow[]): string | null {
  const lines = rows
    .map((row) => {
      if (row.rating === "down") {
        return hasComment(row)
          ? `- Avoid: ${row.comment!.trim()}`
          : `- Disliked, no reason given: "${truncate(row.itemText)}"`;
      }

      return hasComment(row) ? `- Well received: ${row.comment!.trim()}` : null;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) {
    return null;
  }

  return ["Prior feedback on this topic — respect it:", ...lines].join("\n");
}
