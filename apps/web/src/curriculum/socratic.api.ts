import { createServerFn } from '@tanstack/react-start'
import {
  answerSocraticInput,
  startSocraticSessionInput,
  type AnswerSocraticResult,
} from '@post-anki/shared'

import * as api from './api-client'
import type { StartSocraticSessionResult } from './api-client'

export const startSocraticSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => startSocraticSessionInput.parse(data))
  .handler(({ data }): Promise<StartSocraticSessionResult> => api.startSocraticSession(data))

export const answerSocraticSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => answerSocraticInput.parse(data))
  .handler(
    ({ data }): Promise<AnswerSocraticResult | null> =>
      api.answerSocraticSession(data),
  )
