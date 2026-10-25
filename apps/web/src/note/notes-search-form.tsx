import { useEffect, useState } from 'react'

import { CONCERNS, type Concern } from '@post-anki/shared'

import { buildNoteSearchParams, type NoteSearchParams } from './note-search-params'
import { indentedLabel, type DomainNodeOption } from './note-taxonomy-options'
import { SearchableSelect } from '../ui/searchable-select'

export interface NotesSearchFormProps {
  subjects: Array<{ id: string; name: string }>
  selectedSubjectId: string
  onSubjectChange: (subjectId: string) => void
  domainNodeOptions: DomainNodeOption[]
  onSearch: (params: NoteSearchParams) => void
  busy: boolean
  initialQuery?: string
  initialConcern?: Concern
  initialDomainNodeId?: string
}

export function NotesSearchForm({
  subjects,
  selectedSubjectId,
  onSubjectChange,
  domainNodeOptions,
  onSearch,
  busy,
  initialQuery = '',
  initialConcern,
  initialDomainNodeId = '',
}: NotesSearchFormProps) {
  const [query, setQuery] = useState(initialQuery)
  const [concern, setConcern] = useState<Concern | ''>(initialConcern ?? '')
  const [domainNodeId, setDomainNodeId] = useState(initialDomainNodeId)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setConcern(initialConcern ?? '')
  }, [initialConcern])

  useEffect(() => {
    setDomainNodeId(initialDomainNodeId)
  }, [initialDomainNodeId])

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

        <SearchableSelect
          ariaLabel="Subject"
          testId="notes-search-subject"
          options={subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
          value={selectedSubjectId}
          onChange={(id) => {
            onSubjectChange(id)
            setDomainNodeId('')
          }}
          clearable
          placeholder="Any subject"
          className="w-48 cursor-pointer rounded-md border border-neutral-300 bg-white py-1.5 pl-2 pr-8 text-xs"
        />

        <SearchableSelect
          ariaLabel="Area"
          testId="notes-search-domain-node"
          options={domainNodeOptions.map((option) => ({ id: option.id, label: indentedLabel(option) }))}
          value={domainNodeId}
          onChange={setDomainNodeId}
          disabled={domainNodeOptions.length === 0}
          clearable
          placeholder="Any area"
          className="w-48 cursor-pointer rounded-md border border-neutral-300 bg-white py-1.5 pl-2 pr-8 text-xs disabled:opacity-50"
        />
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
