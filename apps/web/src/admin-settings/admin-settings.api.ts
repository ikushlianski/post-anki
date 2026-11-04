import { createServerFn } from '@tanstack/react-start'

import {
  updateAdminSettingsInput,
  type AdminSettingsResponse,
} from '@post-anki/shared'
import * as api from '../curriculum/api-client'

export type FusionSaveResult =
  | { ok: true; settings: AdminSettingsResponse }
  | { ok: false; message: string }

export const getAdminSettings = createServerFn({ method: 'GET' }).handler(
  (): Promise<AdminSettingsResponse> => api.getAdminSettings(),
)

export const updateAdminSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateAdminSettingsInput.parse(data))
  .handler(({ data }): Promise<AdminSettingsResponse> => api.updateAdminSettings(data))

function refusalMessage(error: api.ApiError): string {
  const details = error.details as { message?: unknown } | undefined
  const raw = details?.message
  const parts = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]
  const text = parts.filter((part): part is string => typeof part === 'string').join('; ')

  return text || 'The server refused these fusion settings.'
}

export const saveFusionSettings = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) =>
    updateAdminSettingsInput.pick({ fusionEnabled: true, fusionModelIds: true }).parse(data),
  )
  .handler(async ({ data }): Promise<FusionSaveResult> => {
    try {
      return { ok: true, settings: await api.updateAdminSettings(data) }
    } catch (error) {
      if (error instanceof api.ApiError && error.status === 400) {
        return { ok: false, message: refusalMessage(error) }
      }

      throw error
    }
  })
