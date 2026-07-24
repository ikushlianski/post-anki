import { eq, useLiveQuery } from '@tanstack/react-db'

import { mapPracticeSettingsRow, practiceSettingsCollection } from './practice.collection'

export function usePracticeSettings(subjectId: string) {
  const { data: settingsRows } = useLiveQuery(
    (q) =>
      q
        .from({ settings: practiceSettingsCollection })
        .where(({ settings }) => eq(settings.subject_id, subjectId)),
    [subjectId],
  )

  return settingsRows[0] ? mapPracticeSettingsRow(settingsRows[0]) : undefined
}
