export const EMPTY_INBOX_REPLY = "Inbox is empty.";

export interface InboxSummary {
  count: number;
  shown: number;
  total?: number;
  hasMore?: boolean;
}

export function formatInboxReply(summary: InboxSummary, webBaseUrl?: string): string {
  const { count, shown, total, hasMore } = summary;

  if (count <= 0) return EMPTY_INBOX_REPLY;

  const label = hasMore ? `${shown}+ cards` : `${count} ${count === 1 ? "card" : "cards"}`;
  const head = `📥 ${label} in your Inbox`;
  const line = webBaseUrl ? `${head} — ${webBaseUrl.replace(/\/+$/, "")}/knowledge/inbox` : head;

  if (!hasMore) return line;

  return `${line}\nShowing the first ${shown}${total === undefined ? "" : ` of ${total}`}`;
}
