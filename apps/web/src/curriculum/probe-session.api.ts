import { createServerFn } from '@tanstack/react-start'
import {
  answerProbeSessionInput,
  prepareProbeSessionInput,
  probeScopeSchema,
  type AnswerProbeSessionResult,
  type ProbeSession,
} from '@post-anki/shared'
import { z } from 'zod'

import * as api from './api-client'

const getActiveProbeSessionInput = z.object({
  scope: probeScopeSchema,
  scopeId: z.string(),
})

export const getActiveProbeSession = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => getActiveProbeSessionInput.parse(data))
  .handler(({ data }): Promise<ProbeSession | null> => api.getActiveProbeSession(data))

export const prepareProbeSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => prepareProbeSessionInput.parse(data))
  .handler(({ data }): Promise<ProbeSession | null> => api.prepareProbeSession(data))

export const answerProbeSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => answerProbeSessionInput.parse(data))
  .handler(
    ({ data }): Promise<AnswerProbeSessionResult | null> =>
      api.answerProbeSession(data),
  )
