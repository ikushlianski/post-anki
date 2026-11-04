import type { ReviewGrade } from "@/api/review-commands";

export type ReviewKeyAction = { type: "reveal" } | { type: "grade"; grade: ReviewGrade } | { type: "undo" };

export interface ReviewKeyEvent {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  targetIsEditable: boolean;
  targetIsControl: boolean;
}

export interface ReviewKeyScreen {
  hasCard: boolean;
  revealed: boolean;
  busy: boolean;
  editing: boolean;
  canUndo: boolean;
}

export interface ReviewKeyResult {
  action: ReviewKeyAction | null;
  preventDefault: boolean;
}

const NOTHING: ReviewKeyResult = { action: null, preventDefault: false };

const GRADE_BY_CODE: Readonly<Record<string, ReviewGrade>> = {
  Digit1: "again",
  Numpad1: "again",
  Digit2: "hard",
  Numpad2: "hard",
  Digit3: "good",
  Numpad3: "good",
  Digit4: "easy",
  Numpad4: "easy",
};

const REVEAL_CODES: ReadonlySet<string> = new Set(["Space", "Enter", "NumpadEnter"]);

export function mapReviewKey(event: ReviewKeyEvent, screen: ReviewKeyScreen): ReviewKeyResult {
  const blocked =
    event.targetIsEditable ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    screen.editing ||
    screen.busy;

  if (blocked) {
    return NOTHING;
  }

  if (event.code === "KeyU") {
    return screen.canUndo ? { action: { type: "undo" }, preventDefault: true } : NOTHING;
  }

  if (!screen.hasCard) {
    return NOTHING;
  }

  if (REVEAL_CODES.has(event.code)) {
    const isSpace = event.code === "Space";

    if (screen.revealed) {
      if (!isSpace && !event.targetIsControl) {
        return { action: { type: "grade", grade: "good" }, preventDefault: true };
      }

      return { action: null, preventDefault: isSpace && !event.targetIsControl };
    }

    if (event.targetIsControl) {
      return NOTHING;
    }

    return { action: { type: "reveal" }, preventDefault: true };
  }

  const grade = GRADE_BY_CODE[event.code];

  if (grade && screen.revealed) {
    return { action: { type: "grade", grade }, preventDefault: true };
  }

  return NOTHING;
}
