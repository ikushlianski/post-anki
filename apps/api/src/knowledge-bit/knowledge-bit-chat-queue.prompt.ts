import { CHAT_QUEUE_CONTEXT_MAX_CHARS, CHAT_QUEUE_REPLAY_MESSAGES, type ChatQueueMessage } from "@post-anki/shared";

const CARD_SHARE_CHARS = Math.floor(CHAT_QUEUE_CONTEXT_MAX_CHARS / 2);
const KEYWORD_MIN_CHARS = 5;

export function escapeUntrusted(text: string): string {
  return text.replace(/</g, "&lt;");
}

function keywordsOf(text: string): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  return [...new Set(words.filter((word) => word.length >= KEYWORD_MIN_CHARS))];
}

export function pickSourceExcerpt(sourceText: string | null, cardText: string, maxChars: number): string {
  if (!sourceText || maxChars <= 0) {
    return "";
  }

  if (sourceText.length <= maxChars) {
    return sourceText;
  }

  const keywords = keywordsOf(cardText);
  const step = Math.max(1, Math.floor(maxChars / 2));
  let bestStart = 0;
  let bestScore = -1;

  for (let start = 0; start < sourceText.length; start += step) {
    const window = sourceText.slice(start, start + maxChars).toLowerCase();
    const score = keywords.filter((word) => window.includes(word)).length;

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }

  return sourceText.slice(bestStart, bestStart + maxChars);
}

function historyLine(entry: ChatQueueMessage): string {
  const lines = [`${entry.role === "user" ? "Learner" : "Assistant"}: ${escapeUntrusted(entry.text)}`];

  for (const proposal of entry.proposals ?? []) {
    lines.push(`[proposed card: ${escapeUntrusted(proposal.front)} -> ${proposal.status}]`);
  }

  return lines.join("\n");
}

export interface ChatQueuePromptInput {
  body: string;
  background: string | null;
  sourceText: string | null;
  sourceAuthor?: string | null;
  sourceUrl?: string | null;
  history: ChatQueueMessage[];
  message: string;
}

function sourceInfoBlock(author: string | null | undefined, url: string | null | undefined): string | null {
  const lines = [author ? `author: ${escapeUntrusted(author)}` : null, url ? `url: ${escapeUntrusted(url)}` : null].filter(
    (line): line is string => line !== null,
  );

  return lines.length ? `<source_info>\n${lines.join("\n")}\n</source_info>` : null;
}

export function buildChatQueuePrompt(input: ChatQueuePromptInput): string {
  const cardText = [input.body, input.background].filter(Boolean).join("\n\n").slice(0, CARD_SHARE_CHARS);
  const excerpt = pickSourceExcerpt(input.sourceText, cardText, CHAT_QUEUE_CONTEXT_MAX_CHARS - cardText.length);
  const history = input.history
    .slice(-CHAT_QUEUE_REPLAY_MESSAGES)
    .map(historyLine)
    .join("\n");

  return [
    `<card>\n${escapeUntrusted(cardText)}\n</card>`,
    sourceInfoBlock(input.sourceAuthor, input.sourceUrl),
    excerpt ? `<source_excerpt>\n${escapeUntrusted(excerpt)}\n</source_excerpt>` : null,
    history ? `<history>\n${history}\n</history>` : null,
    `<learner_message>\n${escapeUntrusted(input.message)}\n</learner_message>`,
  ]
    .filter((section): section is string => section !== null)
    .join("\n\n");
}
