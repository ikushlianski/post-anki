import { createMemoryOfflineStore } from './memory-offline-store'
import { currentOfflineScope } from './offline-scope'
import {
  queuedGradeSchema,
  storedPackSchema,
  type OfflineReviewStore,
  type QueuedGrade,
  type RawOfflineStore,
  type StoredPack,
} from './offline-review-types'

export function createSafeOfflineStore(
  primary: RawOfflineStore,
  fallback: RawOfflineStore = createMemoryOfflineStore(),
  scopeOf: () => string = currentOfflineScope,
): OfflineReviewStore {
  async function readGrades(raw: RawOfflineStore): Promise<QueuedGrade[]> {
    let items: unknown[]

    try {
      items = await raw.listGrades()
    } catch {
      return []
    }

    const valid: QueuedGrade[] = []

    for (const item of items) {
      const parsed = queuedGradeSchema.safeParse(item)

      if (parsed.success) {
        valid.push(parsed.data)
      } else if (typeof item === 'object' && item !== null && 'requestId' in item && typeof item.requestId === 'string') {
        await raw.deleteGrade(item.requestId).catch(() => undefined)
      }
    }

    return valid
  }

  async function listGrades() {
    const merged = new Map<string, QueuedGrade>()

    for (const grade of [...(await readGrades(fallback)), ...(await readGrades(primary))]) {
      merged.set(grade.requestId, grade)
    }

    const scope = scopeOf()

    return [...merged.values()]
      .filter((grade) => grade.scope === undefined || grade.scope === scope)
      .sort((a, b) => a.createdAt - b.createdAt)
  }

  async function parsePack(raw: RawOfflineStore): Promise<StoredPack | null> {
    try {
      const parsed = storedPackSchema.safeParse(await raw.readPack())

      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  return {
    listGrades,
    hasGrade: async (requestId) => (await listGrades()).some((grade) => grade.requestId === requestId),
    async readPack() {
      const pack = (await parsePack(fallback)) ?? (await parsePack(primary))

      return pack && pack.scope === scopeOf() ? pack : null
    },
    async writePack(value) {
      const stored: StoredPack = { ...value, scope: scopeOf() }

      await fallback.writePack(stored).catch(() => undefined)

      try {
        await primary.writePack(stored)

        return true
      } catch {
        return false
      }
    },
    async putGrade(grade) {
      const stamped = { ...grade, scope: scopeOf() }

      try {
        await primary.putGrade(stamped)
        await fallback.deleteGrade(grade.requestId).catch(() => undefined)

        return true
      } catch {
        await fallback.putGrade(stamped).catch(() => undefined)

        return false
      }
    },
    async deleteGrade(requestId) {
      await Promise.all([
        primary.deleteGrade(requestId).catch(() => undefined),
        fallback.deleteGrade(requestId).catch(() => undefined),
      ])
    },
    async clear() {
      const results = await Promise.allSettled([primary.clear(), fallback.clear()])
      const failed = results.find((result) => result.status === 'rejected')

      if (failed) {
        throw failed.reason
      }
    },
  }
}
