import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { modelTierSchema, type AdminSettings } from '@post-anki/shared'
import * as api from '../curriculum/api-client'

const updateAdminSettingsInput = z.object({
  testToggle: z.boolean().optional(),
  modelTier: modelTierSchema.optional(),
})

export const getAdminSettings = createServerFn({ method: 'GET' }).handler(
  (): Promise<AdminSettings> => api.getAdminSettings(),
)

export const updateAdminSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateAdminSettingsInput.parse(data))
  .handler(({ data }): Promise<AdminSettings> => api.updateAdminSettings(data))
