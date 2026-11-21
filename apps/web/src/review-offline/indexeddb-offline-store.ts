import type { QueuedGrade, RawOfflineStore, StoredPack } from './offline-review-types'

const DB_NAME = 'post-anki-offline-review'
const PACK_STORE = 'pack'
const GRADE_STORE = 'grades'
const PACK_KEY = 'current'

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb request failed'))
  })
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('indexeddb transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('indexeddb transaction aborted'))
  })
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(PACK_STORE)
      request.result.createObjectStore(GRADE_STORE, { keyPath: 'requestId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb open failed'))
    request.onblocked = () => reject(new Error('indexeddb open blocked'))
  })
}

export function createIndexedDbOfflineStore(factory: IDBFactory): RawOfflineStore {
  let opened: Promise<IDBDatabase> | null = null

  const db = () => {
    opened ??= openDb(factory).catch((error: unknown) => {
      opened = null

      throw error
    })

    return opened
  }

  async function run<T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
    const tx = (await db()).transaction(storeName, mode)
    const result = settle(work(tx.objectStore(storeName)))

    await finished(tx)

    return result
  }

  async function clearAll(): Promise<void> {
    const tx = (await db()).transaction([PACK_STORE, GRADE_STORE], 'readwrite')

    tx.objectStore(PACK_STORE).clear()
    tx.objectStore(GRADE_STORE).clear()

    await finished(tx)
  }

  return {
    clear: clearAll,
    readPack: () => run<unknown>(PACK_STORE, 'readonly', (store) => store.get(PACK_KEY)).then((value) => value ?? null),
    writePack: async (value: StoredPack) => {
      await run(PACK_STORE, 'readwrite', (store) => store.put(value, PACK_KEY))
    },
    listGrades: () => run<unknown[]>(GRADE_STORE, 'readonly', (store) => store.getAll()),
    putGrade: async (grade: QueuedGrade) => {
      await run(GRADE_STORE, 'readwrite', (store) => store.put(grade))
    },
    deleteGrade: async (requestId) => {
      await run(GRADE_STORE, 'readwrite', (store) => store.delete(requestId))
    },
  }
}
