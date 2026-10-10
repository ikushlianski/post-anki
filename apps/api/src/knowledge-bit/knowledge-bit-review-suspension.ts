import type { KnowledgeBitScheduleControls } from "./knowledge-bit-schedule.repo.js";

export interface SuspensionChangeInput {
  current: KnowledgeBitScheduleControls | null;
  input: { suspended?: boolean; buried?: boolean };
  now: Date;
  buryUntil: Date;
}

export function deriveSuspensionChange({
  current,
  input,
  now,
  buryUntil,
}: SuspensionChangeInput): KnowledgeBitScheduleControls {
  const suspendedAt = current?.suspendedAt ?? null;
  const buriedUntil = current?.buriedUntil ?? null;

  return {
    suspendedAt:
      input.suspended === undefined ? suspendedAt : input.suspended ? (suspendedAt ?? now) : null,
    buriedUntil: input.buried === undefined ? buriedUntil : input.buried ? buryUntil : null,
  };
}
