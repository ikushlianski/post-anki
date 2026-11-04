export type NotionApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null }
