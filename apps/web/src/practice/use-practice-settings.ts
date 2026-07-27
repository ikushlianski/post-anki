import { eq, useLiveQuery } from '@tanstack/react-db'

import type { PracticeSettings } from '@post-anki/shared'

import { mapPracticeSettingsRow, practiceSettingsCollection } from './practice.collection'

// The route loader's REST getPracticeSettings() call always resolves first
// (it's a plain server-side fetch, no Electric round trip) and upserts a
// default row on first read, so `initial` is present far sooner than
// Electric's live query — and stays the fallback for as long as Electric
// hasn't delivered anything yet, live sync down or not.
export function resolvePracticeSettings(
  live: PracticeSettings | undefined,
  initial: PracticeSettings | undefined,
): PracticeSettings | undefined {
  return live ?? initial
}

export function usePracticeSettings(
  subjectId: string,
  initialSettings?: PracticeSettings,
) {
  const { data: settingsRows } = useLiveQuery(
    (q) =>
      q
        .from({ settings: practiceSettingsCollection })
        .where(({ settings }) => eq(settings.subject_id, subjectId)),
    [subjectId],
  )

  const live = settingsRows[0] ? mapPracticeSettingsRow(settingsRows[0]) : undefined

  return resolvePracticeSettings(live, initialSettings)
}
