import type {
  AddKnowledgeRejection,
  SourceStatus,
  SubjectAdvice,
  SubjectConfidence,
  SubjectRecommendation,
} from "@/api/add-knowledge-commands";

export const LABEL_MAX_CHARS = 60;
export const MAX_NOTE_POLLS = 40;
export const NOTE_POLL_INTERVAL_MS = 3000;

export const CONFIDENCE_LABELS: Record<SubjectConfidence, string> = {
  high: "Strong match",
  medium: "Likely match",
  low: "Possible match",
};

export type AddedNotePhase = "queued" | "working" | "ready" | "nothing" | "failed" | "slow";

export interface AddedNote {
  sourceId: string;
  label: string;
  phase: AddedNotePhase;
  cardCount: number;
  polls: number;
}

export function canSubmit(text: string, busy: boolean): boolean {
  return !busy && text.trim().length > 0;
}

export function labelFromText(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();

  return collapsed.length > LABEL_MAX_CHARS ? `${collapsed.slice(0, LABEL_MAX_CHARS - 3)}...` : collapsed;
}

export function recommendationsFrom(advice: SubjectAdvice): SubjectRecommendation[] {
  return advice.status === "ok" ? advice.recommendations : [];
}

export function isDuplicateRejection(reason: unknown): reason is AddKnowledgeRejection {
  return typeof reason === "object" && reason !== null && "kind" in reason && reason.kind === "duplicate";
}

export function rejectionMessage(reason: unknown, fallback: string): string {
  if (typeof reason === "string" && reason.trim().length > 0) {
    return reason;
  }

  if (typeof reason === "object" && reason !== null && "kind" in reason && "message" in reason && typeof reason.message === "string") {
    return reason.message.trim().length > 0 ? reason.message : fallback;
  }

  return fallback;
}

export function newNote(entry: { sourceId: string; label: string }): AddedNote {
  return { ...entry, phase: "queued", cardCount: 0, polls: 0 };
}

export function isNoteActive(note: AddedNote): boolean {
  return note.phase === "queued" || note.phase === "working";
}

export function noteAfterStatus(note: AddedNote, status: SourceStatus): AddedNote {
  switch (status.status) {
    case "running":
      return { ...note, phase: "working" };
    case "failed":
      return { ...note, phase: "failed" };
    case "nothing_extracted":
      return { ...note, phase: "nothing" };
    case "done": {
      const cardCount = status.cardCount ?? 0;

      return cardCount > 0 ? { ...note, phase: "ready", cardCount } : { ...note, phase: "nothing" };
    }
  }
}

export function advanceNote(note: AddedNote, status: SourceStatus | null): AddedNote {
  const polls = note.polls + 1;
  const polled: AddedNote =
    polls >= MAX_NOTE_POLLS && isNoteActive(note) ? { ...note, polls, phase: "slow" } : { ...note, polls };

  return status ? noteAfterStatus(polled, status) : polled;
}

export function noteStatusText(note: AddedNote): string {
  switch (note.phase) {
    case "queued":
      return "Queued. Waiting to start.";
    case "working":
      return "Working on it. Cards usually appear within a minute or two.";
    case "ready":
      return `${note.cardCount} ${note.cardCount === 1 ? "card" : "cards"} created.`;
    case "nothing":
      return "Nothing worth keeping in this note.";
    case "failed":
      return "Extraction failed. Try adding it again.";
    case "slow":
      return "Still working. Check Triage for the result.";
  }
}
