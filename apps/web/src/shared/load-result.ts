export type LoadResult<T> = { ok: true; data: T } | { ok: false }

export async function settle<T>(promise: Promise<T>): Promise<LoadResult<T>> {
  try {
    return { ok: true, data: await promise }
  } catch {
    return { ok: false }
  }
}

export async function settleNullable<T>(promise: Promise<T | null>): Promise<LoadResult<T>> {
  const value = await promise.catch(() => null)

  return value === null ? { ok: false } : { ok: true, data: value }
}
