/** Pure metric calculations (no Firebase). */
const DAY = 86400_000;
export type CohortUser = {createdAt: number; lastActiveAt: number};
/**
 * "Still active after N days": share of a sign-up cohort whose last activity is at least N
 * days after sign-up. Only users who signed up at least N days ago are eligible for day N.
 */
export function retention(users: CohortUser[], now: number, days: number[]): {day: number; eligible: number; retained: number; rate: number | null}[] {
  return days.map(d => {
    const eligible = users.filter(u => u.createdAt && now - u.createdAt >= d * DAY);
    const retained = eligible.filter(u => u.lastActiveAt - u.createdAt >= d * DAY).length;
    return {day: d, eligible: eligible.length, retained, rate: eligible.length ? retained / eligible.length : null};
  });
}
export function versionShare(versions: string[]): {version: string; count: number}[] {
  const m = new Map<string, number>();
  for (const v of versions) m.set(v || 'unknown', (m.get(v || 'unknown') ?? 0) + 1);
  return [...m.entries()].map(([version, count]) => ({version, count})).sort((a, b) => b.count - a.count);
}

