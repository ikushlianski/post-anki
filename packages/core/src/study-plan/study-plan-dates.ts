const DAY_MS = 86_400_000;

export function addLocalDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00Z`);

  moment.setUTCDate(moment.getUTCDate() + days);

  return moment.toISOString().slice(0, 10);
}

export function diffLocalDays(later: string, earlier: string): number {
  return Math.round(
    (new Date(`${later}T00:00:00Z`).getTime() - new Date(`${earlier}T00:00:00Z`).getTime()) / DAY_MS,
  );
}
