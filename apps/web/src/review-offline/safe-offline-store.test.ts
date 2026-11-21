import { describe, expect, it } from 'vitest'

import { createMemoryOfflineStore } from './memory-offline-store'
import type { RawOfflineStore } from './offline-review-types'
import { createSafeOfflineStore } from './safe-offline-store'
import { fullGrade, makeCard, makePack } from './test-helpers'

function brokenStore(): RawOfflineStore {
  const fail = () => Promise.reject(new Error('storage unavailable'))

  return { readPack: fail, writePack: fail, listGrades: fail, putGrade: fail, deleteGrade: fail, clear: fail }
}

const packInput = { savedAt: '2026-11-19T10:00:00.000Z', pack: makePack([makeCard('1')]), gradedSince: [] }

describe('safe offline store', () => {
  it('should keep grades in memory when browser storage is unavailable', async () => {
    const store = createSafeOfflineStore(brokenStore())
    const grade = fullGrade()

    expect(await store.putGrade(grade)).toBe(false)
    expect((await store.listGrades()).map((item) => item.requestId)).toEqual([grade.requestId])

    await store.deleteGrade(grade.requestId)

    expect(await store.listGrades()).toEqual([])
  })

  it('should keep the saved cards in memory when browser storage is unavailable', async () => {
    const store = createSafeOfflineStore(brokenStore())

    expect(await store.writePack(packInput)).toBe(false)
    expect((await store.readPack())?.pack.cards).toHaveLength(1)
  })

  it('should delete stored entries that fail validation and ignore a corrupted pack', async () => {
    const raw = createMemoryOfflineStore()
    const store = createSafeOfflineStore(raw)

    await raw.writePack({ savedAt: 'nope' } as never)
    await raw.putGrade({ requestId: 'not-a-uuid' } as never)

    expect(await store.readPack()).toBeNull()
    expect(await store.listGrades()).toEqual([])
    expect(await raw.listGrades()).toEqual([])
  })

  it('should never serve or send another account scope', async () => {
    const raw = createMemoryOfflineStore()
    const mine = createSafeOfflineStore(raw, createMemoryOfflineStore(), () => 'https://one.example')
    const theirs = createSafeOfflineStore(raw, createMemoryOfflineStore(), () => 'https://two.example')

    await mine.writePack(packInput)
    await mine.putGrade(fullGrade())

    expect(await theirs.readPack()).toBeNull()
    expect(await theirs.listGrades()).toEqual([])
    expect(await mine.listGrades()).toHaveLength(1)
    expect(await mine.readPack()).not.toBeNull()
  })

  it('should treat a grade without a scope as belonging to the current one', async () => {
    const raw = createMemoryOfflineStore()
    const store = createSafeOfflineStore(raw, createMemoryOfflineStore(), () => 'https://one.example')

    await raw.putGrade(fullGrade())

    expect(await store.listGrades()).toHaveLength(1)
  })

  it('should wipe the saved pack and queued grades, and report it when browser storage cannot be wiped', async () => {
    const raw = createMemoryOfflineStore()
    const store = createSafeOfflineStore(raw)

    await store.writePack(packInput)
    await store.putGrade(fullGrade())
    await store.clear()

    expect(await store.readPack()).toBeNull()
    expect(await store.listGrades()).toEqual([])
    expect(await raw.listGrades()).toEqual([])
    await expect(createSafeOfflineStore(brokenStore()).clear()).rejects.toThrow('storage unavailable')
  })
})
