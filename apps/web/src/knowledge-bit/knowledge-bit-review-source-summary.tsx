import { toSafeLink } from './ai-label-badge'

export function KnowledgeBitReviewSourceSummary({
  sourceId,
  summary,
  sourceUrl,
}: {
  sourceId: string
  summary: string | null | undefined
  sourceUrl: string | null | undefined
}) {
  const text = summary?.trim()

  if (!text) {
    return null
  }

  const link = sourceUrl ? toSafeLink(sourceUrl) : null

  return (
    <section
      data-testid={`knowledge-bit-review-source-summary-${sourceId}`}
      aria-label="Article summary"
      className="rounded-xl bg-white p-3 text-sm text-neutral-700"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Article summary
      </p>
      <p className="mt-1 whitespace-pre-line break-words leading-relaxed">{text}</p>

      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`knowledge-bit-review-source-link-${sourceId}`}
          className="mt-2 inline-block text-xs text-indigo-600 underline hover:text-indigo-800"
        >
          {link.host}
        </a>
      ) : null}
    </section>
  )
}
