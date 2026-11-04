import type { TriageDecision, TriageItem } from "@/api/triage-commands";

export const TRIAGE_KEYS: Record<TriageDecision, string> = {
  accept: "a",
  reject: "r",
  skip: "s",
};

export type FocusAction = TriageDecision | "undo" | "chat";

const FOCUS_ACTION_KEYS: Record<FocusAction, string> = {
  accept: "a",
  reject: "r",
  skip: "s",
  undo: "u",
  chat: "c",
};

export function decisionForKey(key: string): TriageDecision | null {
  const pressed = key.toLowerCase();
  const decisions = Object.keys(TRIAGE_KEYS) as TriageDecision[];

  return decisions.find((decision) => TRIAGE_KEYS[decision] === pressed) ?? null;
}

export function focusActionForKey(key: string): FocusAction | null {
  const pressed = key.toLowerCase();
  const actions = Object.keys(FOCUS_ACTION_KEYS) as FocusAction[];

  return actions.find((action) => FOCUS_ACTION_KEYS[action] === pressed) ?? null;
}

export function focusKeyLabel(action: FocusAction): string {
  return FOCUS_ACTION_KEYS[action].toUpperCase();
}

export const TRIAGE_SEGMENTS = ["focus", "list", "inbox", "chat", "rejected", "suspended"] as const;

export type TriageSegment = (typeof TRIAGE_SEGMENTS)[number];

export const SEGMENT_LABELS: Record<TriageSegment, string> = {
  focus: "Focus",
  list: "List",
  inbox: "Inbox",
  chat: "Chat",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function proposedSubject(item: TriageItem): { name: string; suggested: boolean } | null {
  if (item.subjectName) {
    return { name: item.subjectName, suggested: false };
  }

  if (item.suggestedSubjectName) {
    return { name: item.suggestedSubjectName, suggested: true };
  }

  return null;
}

export function toggleSelected(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function withoutIds(ids: readonly string[], removed: readonly string[]): string[] {
  return ids.filter((id) => !removed.includes(id));
}
