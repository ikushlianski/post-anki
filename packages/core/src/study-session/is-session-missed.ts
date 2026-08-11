export function isSessionMissed(
  status: string,
  scheduledFor: string | null,
  now: string,
): boolean {
  if (status !== "planned" || !scheduledFor) {
    return false;
  }

  return new Date(scheduledFor).getTime() < new Date(now).getTime();
}
