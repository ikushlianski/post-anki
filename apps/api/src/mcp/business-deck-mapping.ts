import { getDb } from "../db/client.js";
import { BUSINESS_SUBJECT_NAME, type SubjectSeedStore } from "../subject/seed/business-sub-subjects.seed.js";
import { createSubjectSeedStore } from "../subject/seed/subject-seed.store.js";

export const BUSINESS_DECK_TO_SUBJECT: Readonly<Record<string, string>> = {
  "Основы": "Common",
  "Маркетинг и СММ": "Marketing",
  "Маркетинг воронка": "Marketing",
  "Продажи": "Sales",
  "Финансы и планирование": "Finance",
  "Лояльность": "Loyalty",
  "Персонал и зарплаты": "Hiring",
};

const NORMALIZED_DECKS = new Map(
  Object.entries(BUSINESS_DECK_TO_SUBJECT).map(([deck, subject]) => [deck.toLowerCase(), subject]),
);

export type DeckSubjectResolution =
  | { subjectId: string; subjectName: string }
  | { error: "unknown_deck" | "subject_missing"; subjectName?: string };

export function resolveBusinessDeck(deck: string): string | null {
  return NORMALIZED_DECKS.get(deck.trim().toLowerCase()) ?? null;
}

export async function resolveDeckSubjectId(
  deck: string,
  store: Pick<SubjectSeedStore, "findRootByName" | "findChildByName"> = createSubjectSeedStore(getDb()),
): Promise<DeckSubjectResolution> {
  const subjectName = resolveBusinessDeck(deck);

  if (!subjectName) {
    return { error: "unknown_deck" };
  }

  const rootId = await store.findRootByName(BUSINESS_SUBJECT_NAME);

  if (!rootId) {
    return { error: "subject_missing", subjectName };
  }

  const subjectId = await store.findChildByName(rootId, subjectName);

  if (!subjectId) {
    return { error: "subject_missing", subjectName };
  }

  return { subjectId, subjectName };
}
