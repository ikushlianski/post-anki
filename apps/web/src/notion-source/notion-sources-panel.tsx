import { useState } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import type {
  CreateNotionIngestionSourceInput,
  NotionIngestionSource,
  NotionRunResult,
} from '@post-anki/shared'

import { mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import type { NotionApiResult } from './notion-api-result'
import { notionRunErrorText, notionSaveErrorText } from './notion-source-error-text'
import { NotionSourceForm } from './notion-source-form'
import { NotionSourceList } from './notion-source-list'
import {
  createNotionSource,
  deleteNotionSource,
  runNotionSource,
  updateNotionSource,
} from './notion-source.api'

type Editing = { kind: 'new' } | { kind: 'edit'; source: NotionIngestionSource } | null

export function NotionSourcesPanel({
  sources,
  loadFailed,
  onChanged,
}: {
  sources: NotionIngestionSource[]
  loadFailed: boolean
  onChanged: () => Promise<unknown>
}) {
  const subjectsQuery = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const subjects = (subjectsQuery.data ?? []).map(mapSubjectRow)
  const [editing, setEditing] = useState<Editing>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, NotionRunResult | { error: string }>>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = () => onChanged().catch(() => undefined)

  async function save(input: CreateNotionIngestionSourceInput) {
    setSaving(true)
    setFormError(null)

    let result: NotionApiResult<NotionIngestionSource>

    try {
      result =
        editing?.kind === 'edit'
          ? await updateNotionSource({ data: { id: editing.source.id, patch: input } })
          : await createNotionSource({ data: input })
    } catch {
      result = { ok: false, status: 0, code: null }
    }

    setSaving(false)

    if (!result.ok) {
      setFormError(notionSaveErrorText(result))

      return
    }

    setEditing(null)
    await refresh()
  }

  async function togglePause(source: NotionIngestionSource) {
    setBusyId(source.id)
    setActionError(null)

    try {
      const result = await updateNotionSource({ data: { id: source.id, patch: { paused: !source.paused } } })

      if (!result.ok) setActionError('Could not change the paused state. Try again.')
      else await refresh()
    } catch {
      setActionError('Could not change the paused state. Try again.')
    }

    setBusyId(null)
  }

  async function confirmDelete(source: NotionIngestionSource) {
    setBusyId(source.id)
    setActionError(null)

    try {
      const result = await deleteNotionSource({ data: { id: source.id } })

      if (!result.ok && result.code !== 'not_found') setActionError('Could not delete the source. Try again.')
      else {
        setConfirmDeleteId(null)
        await refresh()
      }
    } catch {
      setActionError('Could not delete the source. Try again.')
    }

    setBusyId(null)
  }

  async function ingest(source: NotionIngestionSource) {
    setRunningId(source.id)
    setActionError(null)
    setResults((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== source.id)))

    let outcome: NotionRunResult | { error: string }

    try {
      const result = await runNotionSource({ data: { id: source.id } })

      outcome = result.ok ? result.data : { error: notionRunErrorText(result) }
    } catch {
      outcome = { error: 'The run could not be completed. Try again.' }
    }

    setResults((current) => ({ ...current, [source.id]: outcome }))
    setRunningId(null)
    await refresh()
  }

  return (
    <div className="space-y-4">
      {loadFailed ? (
        <p role="alert" data-testid="notion-sources-load-error" className="text-sm text-red-600">
          Could not load the sources. Reload the page to try again.
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" data-testid="notion-sources-action-error" className="text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      {editing ? (
        <NotionSourceForm
          key={editing.kind === 'edit' ? editing.source.id : 'new'}
          subjects={subjects}
          source={editing.kind === 'edit' ? editing.source : undefined}
          busy={saving}
          errorText={formError}
          onSubmit={(input) => void save(input)}
          onCancel={() => {
            setEditing(null)
            setFormError(null)
          }}
        />
      ) : (
        <button
          type="button"
          data-testid="notion-source-add"
          onClick={() => setEditing({ kind: 'new' })}
          className="min-h-[44px] rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white sm:min-h-0"
        >
          Add source
        </button>
      )}

      {loadFailed ? null : (
        <NotionSourceList
          sources={sources}
          busyId={busyId}
          runningId={runningId}
          confirmDeleteId={confirmDeleteId}
          results={results}
          onEdit={(source) => {
            setFormError(null)
            setEditing({ kind: 'edit', source })
          }}
          onTogglePause={(source) => void togglePause(source)}
          onIngest={(source) => void ingest(source)}
          onAskDelete={(source) => setConfirmDeleteId(source.id)}
          onConfirmDelete={(source) => void confirmDelete(source)}
          onCancelDelete={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  )
}
