import { KNOWLEDGE_BIT_REJECT_REASON_LABELS, type WeeklyDigestCard, type WeeklyDigestCounts } from "@post-anki/shared";

export interface WeeklyDigestReplyInput {
  card: WeeklyDigestCard;
  webBaseUrl?: string;
}

export function formatTrend(current: number, previous: number): string {
  if (current > previous) return `up ${current - previous}`;

  if (current < previous) return `down ${previous - current}`;

  return "same as last week";
}

function line(label: string, key: keyof WeeklyDigestCounts, card: WeeklyDigestCard): string {
  return `${label}: ${card.current[key]} (${formatTrend(card.current[key], card.previous[key])})`;
}

function formatChatLine(cards: number, turns: number): string {
  return `Chat: ${cards} card${cards === 1 ? "" : "s"}, ${turns} turn${turns === 1 ? "" : "s"} this week`;
}

export function formatReasonDelta(delta: number | undefined): string {
  if (!delta) return "";

  return delta > 0 ? ` (+${delta})` : ` (${delta})`;
}

function formatRejectReasonLines(card: WeeklyDigestCard): string[] {
  const reasons = card.topRejectReasons ?? [];

  if (reasons.length === 0) return [];

  return [
    "Top reject reasons:",
    ...reasons.map(
      (item) => `- ${KNOWLEDGE_BIT_REJECT_REASON_LABELS[item.reason]}: ${item.count}${formatReasonDelta(item.delta)}`,
    ),
  ];
}

export function formatWeeklyDigestReply({ card, webBaseUrl }: WeeklyDigestReplyInput): string {
  const lines = [
    "Weekly digest (last 7 days vs previous 7)",
    line("Accepted", "accepted", card),
    line("Rejected", "rejected", card),
    line("Reviewed", "reviewed", card),
    `Chat backlog: ${card.chatBacklog}`,
  ];

  if ((card.chatTurns ?? 0) > 0) {
    lines.push(formatChatLine(card.chatCards ?? 0, card.chatTurns ?? 0));
  }

  const reasonLines = formatRejectReasonLines(card);

  lines.push(...reasonLines);

  if (webBaseUrl) {
    const base = webBaseUrl.replace(/\/+$/, "");

    lines.push(`${base}/knowledge/chat`);

    if (reasonLines.length > 0) lines.push(`${base}/knowledge/rejected`);
  }

  return lines.join("\n");
}
