import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { decideInput, resolveDecideBlindSpotInput } from '@post-anki/shared'

import {
  decide,
  listDecideSessions as apiListDecideSessions,
  resolveDecideBlindSpot as apiResolveDecideBlindSpot,
} from './decide.api'
import type { DecideBlindSpot, DecideSession } from './decide.model'

export const submitDecide = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => decideInput.parse(data))
  .handler(({ data }): Promise<DecideSession> => decide(data))

export const listDecideSessions = createServerFn({ method: 'GET' }).handler(
  (): Promise<DecideSession[]> => apiListDecideSessions(),
)

const resolveDecideBlindSpotForId = resolveDecideBlindSpotInput.extend({
  blindSpotId: z.string().min(1),
})

export const resolveDecideBlindSpot = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof resolveDecideBlindSpotForId>) =>
    resolveDecideBlindSpotForId.parse(data),
  )
  .handler(
    ({ data }): Promise<DecideBlindSpot> =>
      apiResolveDecideBlindSpot(data.blindSpotId, data.status),
  )
