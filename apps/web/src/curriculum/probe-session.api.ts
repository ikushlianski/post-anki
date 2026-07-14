import { createServerFn } from '@tanstack/react-start'
import {
  answerProbeSessionInput,
  prepareProbeSessionInput,
  type AnswerProbeSessionResult,
  type ProbeSession,
} from '@post-anki/shared'

import * as api from './api-client'

export const prepareProbeSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => prepareProbeSessionInput.parse(data))
  .handler(({ data }): Promise<ProbeSession | null> => api.prepareProbeSession(data))

export const answerProbeSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => answerProbeSessionInput.parse(data))
  .handler(
    ({ data }): Promise<AnswerProbeSessionResult | null> =>
      api.answerProbeSession(data),
  )
