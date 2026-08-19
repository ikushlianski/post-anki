import { useState } from 'react'

import type { RoleTemplate } from '@post-anki/shared'

import { formatRoleTemplatePreview } from './role-template-preview'
import type { ApiResult, CreateLearningPathResponse } from './learning-path.model'

export interface RoleTemplateBrowserProps {
  templates: RoleTemplate[]
  onStart: (roleTemplateId: string) => Promise<ApiResult<CreateLearningPathResponse>>
  onStarted: (pathId: string) => void | Promise<void>
}

export function RoleTemplateBrowser({
  templates,
  onStart,
  onStarted,
}: RoleTemplateBrowserProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function start(roleTemplateId: string) {
    setBusyId(roleTemplateId)
    setErrorId(null)
    setErrorMessage(null)

    const result = await onStart(roleTemplateId)

    setBusyId(null)

    if (!result.ok) {
      setErrorId(roleTemplateId)
      setErrorMessage(result.message ?? result.code)
      return
    }

    await onStarted(result.data.path.id)
  }

  if (templates.length === 0) {
    return (
      <p
        data-testid="role-template-empty"
        className="card-empty"
      >
        No role templates available yet.
      </p>
    )
  }

  return (
    <ul data-testid="role-template-list" className="space-y-3">
      {templates.map((template) => (
        <li
          key={template.id}
          data-testid="role-template-card"
          className="rounded-xl border border-neutral-200 bg-white p-4"
        >
          <h3 className="text-sm font-medium text-neutral-900">{template.name}</h3>
          <p className="mt-1 text-xs text-neutral-500">{template.targetRoleLabel}</p>
          <p className="mt-2 text-xs text-neutral-400">
            {formatRoleTemplatePreview(template.targets)}
          </p>

          {errorId === template.id && errorMessage ? (
            <p
              role="alert"
              data-testid="role-template-start-error"
              className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800"
            >
              {errorMessage}
            </p>
          ) : null}

          <button
            type="button"
            disabled={busyId === template.id}
            data-testid="role-template-start"
            onClick={() => void start(template.id)}
            className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {busyId === template.id ? 'Starting…' : 'Start'}
          </button>
        </li>
      ))}
    </ul>
  )
}
