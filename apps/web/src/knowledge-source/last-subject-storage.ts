export const LAST_SUBJECT_STORAGE_KEY = 'post-anki:add-knowledge:last-subject-id'

export function readLastSubjectId(): string {
  try {
    return window.localStorage.getItem(LAST_SUBJECT_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeLastSubjectId(subjectId: string): void {
  try {
    window.localStorage.setItem(LAST_SUBJECT_STORAGE_KEY, subjectId)
  } catch {
    return
  }
}
