const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;

export interface SessionConsistencyInput {
  status: string;
  scheduledFor: string | null;
  completedAt: string | null;
}

export interface SessionConsistency {
  planned: number;
  completed: number;
  rate: number;
}

export function sessionConsistency(
  sessions: SessionConsistencyInput[],
  now: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): SessionConsistency {
  const nowMs = new Date(now).getTime();
  const windowStartMs = nowMs - windowDays * DAY_MS;

  const inWindow = sessions.filter((session) => {
    const anchor = session.completedAt ?? session.scheduledFor;

    if (!anchor) {
      return false;
    }

    const anchorMs = new Date(anchor).getTime();

    return anchorMs <= nowMs && anchorMs >= windowStartMs;
  });

  const planned = inWindow.length;
  const completed = inWindow.filter((session) => session.status === "completed").length;
  const rate = planned === 0 ? 0 : completed / planned;

  return { planned, completed, rate };
}
