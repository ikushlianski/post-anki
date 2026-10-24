export const DEFAULT_LEARNING_INTENT =
  "Learn transferable principles and rules the learner can apply later, not the author's personal story, dates, names or one-off facts.";

export const BUSINESS_LEARNING_INTENT =
  "Learn transferable business principles: how markets, money, customers and decisions work, and what to do differently because of them. Skip personal biography, anecdotes, dates and names of the author unless they are the point.";

export const DEFAULT_INTENT_BY_ROOT_NAME: Record<string, string> = {
  Business: BUSINESS_LEARNING_INTENT,
  Investing:
    "Learn durable investing principles and mechanisms: risk, valuation, incentives and how to reason about decisions. Skip market commentary tied to specific dates, prices or personalities.",
  "Programming / Web Development":
    "Learn concepts, rules and trade-offs a developer can apply in new code: why something works, when to use it, and when not to. Skip version-specific trivia and one-off project history.",
  Databases:
    "Learn how storage and query systems behave and why: guarantees, trade-offs, failure modes and design rules. Skip product marketing and version trivia.",
  Architecture:
    "Learn design principles, boundaries and trade-offs that transfer between systems: why a decision fits a context and what it costs. Skip one-off project history and product names unless they are the point.",
  "Cloud Computing":
    "Learn cloud concepts, trade-offs and operating rules that transfer across providers. Skip pricing snapshots and console click-paths.",
  AI: "Learn how AI and LLM systems work and the practical rules for building with them: mechanisms, limits, failure modes and trade-offs. Skip hype, release news and model names unless they are the point.",
};

export interface SubjectIntentRow {
  id: string;
  parentId: string | null;
  name: string;
  learningIntent: string | null;
}

function nonBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

export function pickLearningIntent(subjectId: string, rows: SubjectIntentRow[]): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let current = byId.get(subjectId);
  let root = current;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);

    const own = nonBlank(current.learningIntent);

    if (own) {
      return own;
    }

    root = current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return (root && DEFAULT_INTENT_BY_ROOT_NAME[root.name]) || DEFAULT_LEARNING_INTENT;
}

export function inheritedLearningIntent(subjectId: string, rows: SubjectIntentRow[]): string {
  return pickLearningIntent(
    subjectId,
    rows.map((row) => (row.id === subjectId ? { ...row, learningIntent: null } : row)),
  );
}
