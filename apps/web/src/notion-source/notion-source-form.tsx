import { useState } from 'react'
import type { FormEvent } from 'react'
import type { SubjectHierarchyRow } from '@post-anki/core'
import {
  DEFAULT_NOTION_ITEMS_PER_RUN,
  MAX_NOTION_ITEMS_PER_RUN,
  NOTION_SOURCE_FREQUENCIES,
  isNotionPageUrl,
  type CreateNotionIngestionSourceInput,
  type NotionIngestionSource,
  type NotionSourceFrequency,
} from '@post-anki/shared'

import { useKnowledgeSubjectChoice } from '../knowledge-source/use-knowledge-subject-choice'
import { SearchableSelect } from '../ui/searchable-select'
import { FREQUENCY_LABELS } from './notion-run-result-text'

const INPUT_CLASS =
  'min-h-[44px] w-full rounded-md border border-neutral-300 px-2 py-1 text-sm sm:min-h-0'

export function NotionSourceForm({
  subjects,
  source,
  busy,
  errorText,
  onSubmit,
  onCancel,
}: {
  subjects: SubjectHierarchyRow[]
  source?: NotionIngestionSource
  busy: boolean
  errorText: string | null
  onSubmit: (input: CreateNotionIngestionSourceInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [pageUrl, setPageUrl] = useState(source?.pageUrl ?? '')
  const [itemsPerRun, setItemsPerRun] = useState(String(source?.itemsPerRun ?? DEFAULT_NOTION_ITEMS_PER_RUN))
  const [frequency, setFrequency] = useState<NotionSourceFrequency>(source?.frequency ?? 'manual')
  const [removeAfterImport, setRemoveAfterImport] = useState(source?.removeAfterImport ?? false)
  const [touched, setTouched] = useState(false)
  const subject = useKnowledgeSubjectChoice(subjects, source?.subjectId)

  const count = Number(itemsPerRun)
  const countValid = Number.isInteger(count) && count >= 1 && count <= MAX_NOTION_ITEMS_PER_RUN
  const urlValid = isNotionPageUrl(pageUrl)
  const valid = name.trim() !== '' && urlValid && subject.selectedSubjectId !== '' && countValid

  function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)

    if (!valid || busy) return

    onSubmit({
      name: name.trim(),
      pageUrl: pageUrl.trim(),
      subjectId: subject.selectedSubjectId,
      itemsPerRun: count,
      frequency,
      removeAfterImport,
    })
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="notion-source-form"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <h2 className="text-lg font-semibold tracking-tight">{source ? 'Edit source' : 'Add source'}</h2>

      <label className="block text-sm">
        Name
        <input
          data-testid="notion-source-name"
          value={name}
          disabled={busy}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>

      <label className="block text-sm">
        Notion page link
        <input
          data-testid="notion-source-url"
          value={pageUrl}
          disabled={busy}
          placeholder="https://www.notion.so/..."
          onChange={(event) => setPageUrl(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      {touched && !urlValid ? (
        <p role="alert" className="text-sm text-red-600">
          Use a link to a Notion page (notion.so or notion.site).
        </p>
      ) : null}

      <div className="text-sm">
        <p className="mb-1">Subject for imported cards</p>
        <SearchableSelect
          ariaLabel="Subject for imported cards"
          options={subject.options}
          value={subject.selectedSubjectId}
          disabled={busy}
          onChange={subject.chooseSubject}
          testId="notion-source-subject"
          placeholder="Pick a subject or sub-subject"
        />
        <label className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={subject.allowParents}
            disabled={busy}
            onChange={(event) => subject.setAllowParents(event.target.checked)}
          />
          Also list subjects that have sub-subjects
        </label>
      </div>
      {touched && subject.selectedSubjectId === '' ? (
        <p role="alert" className="text-sm text-red-600">
          Pick the subject the imported cards go to.
        </p>
      ) : null}

      <label className="block text-sm">
        New items per run (1 to {MAX_NOTION_ITEMS_PER_RUN})
        <input
          type="number"
          data-testid="notion-source-items-per-run"
          value={itemsPerRun}
          min={1}
          max={MAX_NOTION_ITEMS_PER_RUN}
          disabled={busy}
          onChange={(event) => setItemsPerRun(event.target.value)}
          className={INPUT_CLASS}
        />
      </label>
      {touched && !countValid ? (
        <p role="alert" className="text-sm text-red-600">
          Enter a whole number from 1 to {MAX_NOTION_ITEMS_PER_RUN}.
        </p>
      ) : null}

      <label className="block text-sm">
        How often to run
        <select
          data-testid="notion-source-frequency"
          value={frequency}
          disabled={busy}
          onChange={(event) => setFrequency(event.target.value as NotionSourceFrequency)}
          className={INPUT_CLASS}
        >
          {NOTION_SOURCE_FREQUENCIES.map((value) => (
            <option key={value} value={value}>
              {FREQUENCY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-start justify-between gap-4 rounded-md border border-neutral-200 p-3">
        <div className="min-w-0">
          <p id="notion-remove-label" className="text-sm font-medium">
            Remove imported items from Notion
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Imported items are deleted from Notion. Off keeps the page unchanged. Items are only
            removed after a successful import, and blocks with nested content are never removed.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={removeAfterImport}
          aria-labelledby="notion-remove-label"
          data-testid="notion-source-remove-toggle"
          disabled={busy}
          onClick={() => setRemoveAfterImport((current) => !current)}
          className={`min-h-[44px] min-w-[44px] shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-50 sm:min-h-0 sm:min-w-0 ${
            removeAfterImport ? 'bg-emerald-600 text-white' : 'bg-neutral-200 text-neutral-600'
          }`}
        >
          {removeAfterImport ? 'On' : 'Off'}
        </button>
      </div>

      {errorText ? (
        <p role="alert" data-testid="notion-source-form-error" className="text-sm text-red-600">
          {errorText}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          data-testid="notion-source-save"
          disabled={busy}
          className="min-h-[44px] rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 sm:min-h-0"
        >
          {busy ? 'Saving...' : 'Save source'}
        </button>
        <button
          type="button"
          data-testid="notion-source-cancel"
          disabled={busy}
          onClick={onCancel}
          className="min-h-[44px] rounded-md border border-neutral-300 px-3 py-1.5 text-sm sm:min-h-0"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
