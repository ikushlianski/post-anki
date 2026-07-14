export interface MockSubject {
  name: string
  description?: string
  requireSources?: boolean
}

export const MOCK_SUBJECT_BACKEND: MockSubject = {
  name: 'Backend Engineering',
  description: 'Server-side architecture judgment for a senior engineer.',
}

export function uniqueSubjectName(seed: number): string {
  return `E2E Subject ${seed}`
}
