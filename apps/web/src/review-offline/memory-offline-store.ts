import type { QueuedGrade, RawOfflineStore, StoredPack } from './offline-review-types'

export function createMemoryOfflineStore(): RawOfflineStore {
  let pack: StoredPack | null = null
  const grades = new Map<string, QueuedGrade>()

  return {
    readPack: async () => pack,
    writePack: async (value) => {
      pack = value
    },
    listGrades: async () => [...grades.values()],
    putGrade: async (grade) => {
      grades.set(grade.requestId, grade)
    },
    deleteGrade: async (requestId) => {
      grades.delete(requestId)
    },
  }
}
