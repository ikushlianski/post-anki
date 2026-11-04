export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export const NEW_CARDS_RANGE = { min: 1, max: 200 } as const;
export const RETENTION_PERCENT_RANGE = { min: 70, max: 99 } as const;
export const STEP_MINUTES_RANGE = { min: 1, max: 1440 } as const;
export const STEP_COUNT_RANGE = { min: 1, max: 10 } as const;
export const DAILY_GOAL_RANGE = { min: 1, max: 10000 } as const;

const EXAM_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseWholeInRange(
  raw: string,
  range: { min: number; max: number },
  message: string,
): ParseResult<number> {
  const trimmed = raw.trim();
  const value = Number(trimmed);
  const valid = trimmed !== "" && Number.isInteger(value) && value >= range.min && value <= range.max;

  return valid ? { ok: true, value } : { ok: false, message };
}

export function parseSteps(raw: string): ParseResult<number[]> {
  const message = `Enter 1 to ${STEP_COUNT_RANGE.max} gaps in minutes, for example 1, 10.`;
  const parts = raw.split(/[,\s]+/).filter((part) => part !== "");

  if (parts.length < STEP_COUNT_RANGE.min || parts.length > STEP_COUNT_RANGE.max) {
    return { ok: false, message };
  }

  const steps: number[] = [];

  for (const part of parts) {
    const parsed = parseWholeInRange(part, STEP_MINUTES_RANGE, message);

    if (!parsed.ok) {
      return parsed;
    }

    steps.push(parsed.value);
  }

  return { ok: true, value: steps };
}

export function formatSteps(steps: number[]): string {
  return steps.join(", ");
}

export function stepsEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

export function parseRetentionPercent(raw: string): ParseResult<number> {
  const parsed = parseWholeInRange(
    raw,
    RETENTION_PERCENT_RANGE,
    `Desired retention must be a whole number from ${RETENTION_PERCENT_RANGE.min} to ${RETENTION_PERCENT_RANGE.max}.`,
  );

  return parsed.ok ? { ok: true, value: parsed.value / 100 } : parsed;
}

export function retentionToPercent(fraction: number): string {
  return String(Math.round(fraction * 100));
}

export function parseExamDate(raw: string): ParseResult<string> {
  const value = raw.trim();

  if (!EXAM_DATE_PATTERN.test(value)) {
    return { ok: false, message: "Pick the exam date to study for an exam." };
  }

  return { ok: true, value };
}
