export interface ChatExportMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatExportCard {
  body: string;
  background: string | null;
  messages: ChatExportMessage[];
}

const TITLE_MAX_CHARS = 100;

function blockquote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function cardTitle(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();

  if (flat.length <= TITLE_MAX_CHARS) {
    return flat;
  }

  return `${flat.slice(0, TITLE_MAX_CHARS - 1)}…`;
}

export function slugifySubjectName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug === "" ? "subject" : slug;
}

function renderCard(card: ChatExportCard, index: number): string {
  const parts = [`## ${index + 1}. ${cardTitle(card.body)}`, `**Card**\n\n${blockquote(card.body)}`];

  if (card.background) {
    parts.push(`**Background**\n\n${blockquote(card.background)}`);
  }

  parts.push("### Conversation");

  if (card.messages.length === 0) {
    parts.push("No conversation yet");
  }

  for (const message of card.messages) {
    parts.push(`**${message.role === "user" ? "User" : "Assistant"}**\n\n${blockquote(message.text)}`);
  }

  return parts.join("\n\n");
}

export function buildChatExportMarkdown(subjectName: string, cards: ChatExportCard[]): string {
  const header = `# Chat conversations: ${subjectName}`;

  if (cards.length === 0) {
    return `${header}\n\nNo cards in Chat for this subject.\n`;
  }

  return `${header}\n\n${cards.map(renderCard).join("\n\n---\n\n")}\n`;
}
