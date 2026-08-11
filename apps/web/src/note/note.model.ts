export type ApiFailure = {
  ok: false
  status: number
  code: string
  message: string | null
}

export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure
