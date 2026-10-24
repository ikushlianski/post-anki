import type { ExportedCard } from "./knowledge-bit-export.repo.js";

export const CSV_COLUMNS = [
  "question",
  "answer",
  "example",
  "subject",
  "source_links",
  "state",
  "due_at",
  "interval_days",
  "ease",
  "lapses",
  "review_count",
  "last_reviewed_at",
  "review_history",
  "topic",
  "tags",
  "added_at",
  "other_questions",
] as const;

const UTF8_BOM = "\uFEFF";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const text = String(value);
  const guarded = typeof value === "string" && FORMULA_PREFIX.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

export function csvHeaderLine(): string {
  return `${UTF8_BOM}${CSV_COLUMNS.join(",")}\r\n`;
}

export function csvLine(card: ExportedCard): string {
  const history = card.reviews.map((r) => `${r.reviewedAt} ${r.grade}`).join(" | ");
  const cells = [
    card.question,
    card.answer,
    card.example,
    card.subject,
    card.sourceLinks.join(" | "),
    card.state,
    card.dueAt,
    card.intervalDays,
    card.ease,
    card.lapses,
    card.reviewCount,
    card.lastReviewedAt,
    history,
    card.topic,
    card.tags.join(" | "),
    card.addedAt,
    card.otherQuestions.map((q) => `${q.question} => ${q.answer}`).join(" | "),
  ];

  return `${cells.map(csvCell).join(",")}\r\n`;
}
