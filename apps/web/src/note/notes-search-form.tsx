import { useState } from 'react'

import { CONCERNS, type Concern } from '@post-anki/shared'

import { buildNoteSearchParams, type NoteSearchParams } from './note-search-params'
import { indentedLabel, type DomainNodeOption } from './note-taxonomy-options'

export interface NotesSearchFormProps {
  subjects: Array<{ id: string; name: string }>
  selectedSubjectId: string
  onSubjectChange: (subjectId: string) => void
  domainNodeOptions: DomainNodeOption[]
  onSearch: (params: NoteSearchParams) => void
  busy: boolean
}

export function NotesSearchForm({
  subjects,
  selectedSubjectId,
  onSubjectChange,
  domainNodeOptions,
  onSearch,
  busy,
}: NotesSearchFormProps) {
  const [query, setQuery] = useState('')
  const [concern, setConcern] = useState<Concern | ''>('')
  const [domainNodeId, setDomainNodeId] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()

    const params = buildNoteSearchParams(query, concern, domainNodeId)

    if (params) {
      onSearch(params)
    }
  }

  return (
    <form
      onSubmit={submit}
      data-testid="notes-search-form"
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search everything you've written…"
        data-testid="notes-search-query"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <select
          value={concern}
          onChange={(event) => setConcern(event.target.value as Concern | '')}
          data-testid="notes-search-concern"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
        >
          <option value="">Any concern</option>
          {CONCERNS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <select
          value={selectedSubjectId}
          onChange={(event) => {
            onSubjectChange(event.target.value)
            setDomainNodeId('')
          }}
          data-testid="notes-search-subject"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs"
        >
          <option value="">Any subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>

        <select
          value={domainNodeId}
          onChange={(event) => setDomainNodeId(event.target.value)}
          disabled={domainNodeOptions.length === 0}
          data-testid="notes-search-domain-node"
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Any area</option>
          {domainNodeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {indentedLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={busy || query.trim() === ''}
        data-testid="notes-search-submit"
        className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}
