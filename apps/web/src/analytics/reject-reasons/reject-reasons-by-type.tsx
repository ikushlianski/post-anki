import { KNOWLEDGE_BIT_REJECT_REASON_LABELS, type RejectReasonTypeBreakdown, type RejectSubjectType } from '@post-anki/shared'

const TYPE_LABELS: Record<RejectSubjectType, string> = {
  programming: 'Programming',
  language: 'Language',
  business: 'Business',
  other: 'Other',
}

export function RejectReasonsByType({ byType }: { byType: RejectReasonTypeBreakdown[] }) {
  const visible = byType.filter((entry) => entry.total > 0)

  if (visible.length === 0) {
    return null
  }

  return (
    <section data-testid="reject-reasons-by-type" className="mt-6 space-y-4">
      <h3 className="text-sm font-medium">By subject type</h3>
      {visible.map(({ subjectType, total, reasons }) => (
        <div key={subjectType} data-testid={`reject-reasons-type-${subjectType}`}>
          <p className="mb-1 text-sm text-neutral-600">
            {TYPE_LABELS[subjectType]} ({total})
          </p>
          <ul className="space-y-1">
            {reasons.map(({ reasonCode, count, share }) => (
              <li
                key={reasonCode}
                data-testid={`reject-reasons-type-${subjectType}-${reasonCode}`}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-64 shrink-0 truncate text-neutral-600">
                  {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reasonCode]}
                </span>
                <span className="tabular-nums">
                  {count} ({Math.round(share * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
