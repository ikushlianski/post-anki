import { KNOWLEDGE_BIT_VARIANT_KIND_LABELS } from '@post-anki/shared'
import type { KnowledgeBitBrowserItem, KnowledgeBitDetail } from '@post-anki/shared'
import type { ReactNode } from 'react'

import { formatAddedAt } from './knowledge-browser-columns'
import { BROWSER_ADDED_BY_LABELS, BROWSER_ORIGIN_LABELS, BROWSER_STATE_LABELS } from './knowledge-browser-filters'

const NONE = 'None'

function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="mb-5">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>
      {children}
    </section>
  )
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <dt className="w-28 shrink-0 text-neutral-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-neutral-900">{children}</dd>
    </div>
  )
}

function textOrNone(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : NONE
}

function reviewText(review: KnowledgeBitDetail['review']): string {
  const parts = [BROWSER_STATE_LABELS[review.state]]

  if (review.dueAt) {
    parts.push(`next due ${formatAddedAt(review.dueAt)}`)
  }

  if (review.reviewCount > 0) {
    parts.push(`reviewed ${review.reviewCount} ${review.reviewCount === 1 ? 'time' : 'times'}`)
  }

  if (review.lapses > 0) {
    parts.push(`forgotten ${review.lapses} ${review.lapses === 1 ? 'time' : 'times'}`)
  }

  return parts.join(', ')
}

function Source({ detail }: { detail: KnowledgeBitDetail }) {
  const type = BROWSER_ORIGIN_LABELS[detail.origin]

  if (!detail.sourceUrl) {
    return <>{detail.sourceLabel ? `${type}, ${detail.sourceLabel}` : type}</>
  }

  return (
    <>
      {type},{' '}
      <a
        href={detail.sourceUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="knowledge-browser-detail-source-link"
        className="underline"
      >
        {detail.sourceLabel ?? detail.sourceUrl}
      </a>
    </>
  )
}

function FrontBack({ front, back }: { front: string; back: string }) {
  return (
    <>
      <Section title="Front" testId="knowledge-browser-detail-front">
        <p className="whitespace-pre-wrap text-sm text-neutral-900">{front}</p>
      </Section>
      <Section title="Back" testId="knowledge-browser-detail-back">
        <p className="whitespace-pre-wrap text-sm text-neutral-900">{back}</p>
      </Section>
    </>
  )
}

export function KnowledgeBrowserDetailPreview({ row }: { row: KnowledgeBitBrowserItem }) {
  return (
    <div data-testid="knowledge-browser-detail-preview">
      <FrontBack front={row.phrasings[0]?.prompt ?? ''} back={row.answer} />
      <Section title="Phrasings" testId="knowledge-browser-detail-phrasings">
        <ul className="space-y-2">
          {row.phrasings.map((phrasing) => (
            <li key={phrasing.id} className="rounded border border-neutral-200 p-2 text-sm">
              <p className="text-xs text-neutral-500">{KNOWLEDGE_BIT_VARIANT_KIND_LABELS[phrasing.kind]}</p>
              <p className="whitespace-pre-wrap">{phrasing.prompt}</p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

export function KnowledgeBrowserDetailBody({ detail }: { detail: KnowledgeBitDetail }) {
  const first = detail.phrasings[0]

  return (
    <div data-testid="knowledge-browser-detail-body">
      <FrontBack front={first?.prompt ?? ''} back={first?.answer ?? ''} />
      <Section title="Phrasings" testId="knowledge-browser-detail-phrasings">
        <ul className="space-y-2">
          {detail.phrasings.map((phrasing) => (
            <li
              key={phrasing.id}
              data-testid="knowledge-browser-detail-phrasing"
              className="rounded border border-neutral-200 p-2 text-sm"
            >
              <p className="text-xs text-neutral-500">{phrasing.kindLabel}</p>
              <p className="whitespace-pre-wrap">{phrasing.prompt}</p>
              <p className="mt-1 whitespace-pre-wrap text-neutral-700">Answer: {phrasing.answer}</p>
              {phrasing.sentence && (
                <p className="mt-1 whitespace-pre-wrap text-neutral-700">Sentence: {phrasing.sentence}</p>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Details" testId="knowledge-browser-detail-meta">
        <dl>
          <MetaRow label="Subject">
            {detail.subjectPath.length > 0 ? detail.subjectPath.join(' / ') : NONE}
          </MetaRow>
          <MetaRow label="Tags">{detail.tags.length > 0 ? detail.tags.join(', ') : NONE}</MetaRow>
          <MetaRow label="Context / example">{textOrNone(detail.context)}</MetaRow>
          <MetaRow label="Source">
            <Source detail={detail} />
          </MetaRow>
          <MetaRow label="Added by">{BROWSER_ADDED_BY_LABELS[detail.addedBy]}</MetaRow>
          <MetaRow label="Date added">{formatAddedAt(detail.addedAt)}</MetaRow>
          <MetaRow label="Review">{reviewText(detail.review)}</MetaRow>
        </dl>
      </Section>
    </div>
  )
}
