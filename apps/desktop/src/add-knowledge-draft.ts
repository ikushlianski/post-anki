export interface AddKnowledgeDraft {
  text: string;
  subjectId: string;
}

export const ADD_KNOWLEDGE_DRAFT_KEY = "post-anki:add-knowledge:draft";

const EMPTY_DRAFT: AddKnowledgeDraft = { text: "", subjectId: "" };

function isDraft(value: unknown): value is AddKnowledgeDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    "text" in value &&
    "subjectId" in value &&
    typeof value.text === "string" &&
    typeof value.subjectId === "string"
  );
}

export function readDraft(): AddKnowledgeDraft {
  try {
    const raw = window.localStorage.getItem(ADD_KNOWLEDGE_DRAFT_KEY);

    if (raw === null) {
      return EMPTY_DRAFT;
    }

    const parsed: unknown = JSON.parse(raw);

    return isDraft(parsed) ? parsed : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function writeDraft(draft: AddKnowledgeDraft): void {
  try {
    if (draft.text.trim().length === 0 && draft.subjectId === "") {
      window.localStorage.removeItem(ADD_KNOWLEDGE_DRAFT_KEY);

      return;
    }

    window.localStorage.setItem(ADD_KNOWLEDGE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    return;
  }
}
