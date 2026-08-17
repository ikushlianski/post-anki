export interface ShouldEndSessionInput {
  startedAt: string | null;
  plannedDurationMinutes: number;
  now: string;
  userRequestedEnd: boolean;
}

export function shouldEndSession(input: ShouldEndSessionInput): boolean {
  if (input.userRequestedEnd) {
    return true;
  }

  if (!input.startedAt) {
    return false;
  }

  const elapsedMs = new Date(input.now).getTime() - new Date(input.startedAt).getTime();
  const plannedMs = input.plannedDurationMinutes * 60_000;

  return elapsedMs >= plannedMs;
}
