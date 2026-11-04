import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { updateAccountInputSchema, type Account } from '@post-anki/shared'

import { fetchAccount } from './account.api-client'

export const getAccount = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Account | null> => {
    try {
      return await fetchAccount(getRequestHeader('cookie') ?? '')
    } catch {
      return null
    }
  },
)

export const updateAccount = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateAccountInputSchema.parse(data))
  .handler(
    ({ data }): Promise<Account> =>
      fetchAccount(getRequestHeader('cookie') ?? '', { method: 'PATCH', body: data }),
  )
