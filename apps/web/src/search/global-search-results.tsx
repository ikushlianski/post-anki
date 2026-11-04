import { Link } from '@tanstack/react-router'

import type { ReactNode } from 'react'
import type { SearchResultItem, TopicModuleSearchResult } from '@post-anki/shared'
import type { HeaderSearchResults } from './header-search'

export function countSearchResults(results: HeaderSearchResults): number {
  return results.subjects.length + results.curricula.length + results.items.length
}

const GROUP_LABELS: Record<TopicModuleSearchResult['kind'], string> = {
  topic: 'Topics',
  module: 'Modules',
  bit: 'Cards',
}

export function SearchResultsList({
  results,
  query,
  onSelect,
}: {
  results: HeaderSearchResults
  query: string
  onSelect: () => void
}) {
  const hasResults =
    results.subjects.length > 0 || results.curricula.length > 0 || results.items.length > 0

  if (!hasResults) {
    return (
      <div className="px-3 py-2 text-sm text-neutral-500">
        <p>No results</p>
        <Link
          to="/add-knowledge"
          search={{ q: query }}
          data-testid="global-search-add-knowledge"
          onClick={onSelect}
          className="mt-1 inline-block text-indigo-600 hover:underline"
        >
          Add this as knowledge
        </Link>
      </div>
    )
  }

  return (
    <>
      <LegacyResultGroup
        label="Subjects"
        items={results.subjects}
        renderItem={(subject) => (
          <Link
            key={subject.id}
            to="/subject/$subjectId"
            params={{ subjectId: subject.id }}
            data-testid={`global-search-result-subject-${subject.id}`}
            onClick={onSelect}
            className="block px-3 py-2 text-sm hover:bg-neutral-50"
          >
            {subject.label}
          </Link>
        )}
      />

      <LegacyResultGroup
        label="Curricula"
        items={results.curricula}
        renderItem={(curriculum) => (
          <Link
            key={curriculum.id}
            to="/curriculum/$curriculumId"
            params={{ curriculumId: curriculum.id }}
            data-testid={`global-search-result-curriculum-${curriculum.id}`}
            onClick={onSelect}
            className="block px-3 py-2 text-sm hover:bg-neutral-50"
          >
            {curriculum.label}
          </Link>
        )}
      />

      {(['topic', 'module', 'bit'] as const).map((kind) => (
        <ResultGroup
          key={kind}
          label={GROUP_LABELS[kind]}
          items={results.items.filter((result) => result.kind === kind)}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function LegacyResultGroup({
  label,
  items,
  renderItem,
}: {
  label: string
  items: SearchResultItem[]
  renderItem: (item: SearchResultItem) => ReactNode
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="border-b border-neutral-100 py-1 last:border-b-0">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      {items.map(renderItem)}
    </div>
  )
}

function ResultGroup({
  label,
  items,
  onSelect,
}: {
  label: string
  items: TopicModuleSearchResult[]
  onSelect: () => void
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="border-b border-neutral-100 py-1 last:border-b-0">
      <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </p>
      {items.map((item) => (
        <div
          key={`${item.kind}-${item.id}`}
          data-testid={`global-search-result-${item.kind}-${item.id}`}
          className="px-3 py-2 text-sm hover:bg-neutral-50"
        >
          {item.curriculumId ? (
            <Link
              to="/curriculum/$curriculumId"
              params={{ curriculumId: item.curriculumId }}
              onClick={onSelect}
              className="block font-medium underline underline-offset-2 hover:text-neutral-900"
            >
              {item.title}
            </Link>
          ) : item.kind === 'bit' ? (
            <Link
              to="/knowledge/answer"
              search={{ knowledgeBitId: item.id }}
              onClick={onSelect}
              className="block font-medium underline underline-offset-2 hover:text-neutral-900"
            >
              {item.title}
            </Link>
          ) : (
            <span className="block font-medium">{item.title}</span>
          )}
          <p className="mt-0.5 text-xs text-neutral-400">
            {item.curriculumName ?? 'Not yet placed in a course'}
          </p>
          {item.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to="/probe/tag/$tagId"
                  params={{ tagId: tag.id }}
                  onClick={onSelect}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
