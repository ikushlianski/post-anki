import {
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  type KnowledgeBitRejectReason,
  type TriageHistoryItem,
} from '@post-anki/shared'

const CHIP_CLASS =
  'min-h-11 rounded-full border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-neutral-900 sm:min-h-9'

function isReasonLabelled(code: string): code is KnowledgeBitRejectReason {
  return code in KNOWLEDGE_BIT_REJECT_REASON_LABELS
}

function formatDecidedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function TriageHistoryRow({
  item,
  disabled,
  onSetReason,
}: {
  item: TriageHistoryItem
  disabled: boolean
  onSetReason: (decisionId: string, reasonCode: KnowledgeBitRejectReason | null) => void
}) {
  const rejected = item.verdict === 'rejected'

  return (
    <li data-testid={`triage-history-${item.id}`} className="space-y-2 rounded-md border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-line text-sm font-medium">{item.front ?? 'Card text unavailable'}</p>
        <span
          data-testid={`triage-history-verdict-${item.id}`}
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${rejected ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}
        >
          {rejected ? 'Rejected' : 'Accepted'}
        </span>
      </div>
      {item.back ? <p className="text-sm text-neutral-600">{item.back}</p> : null}
      <p className="text-xs text-neutral-500">
        {formatDecidedAt(item.decidedAt)}
        {item.extractionModelId ? ` · ${item.extractionModelId}` : ''}
        {item.fusionModelIds.length > 0 ? ` · fused ${item.fusionModelIds.join(', ')}` : ''}
      </p>
      {rejected ? (
        <div className="space-y-2">
          {item.reasonCode ? null : (
            <p data-testid={`triage-history-no-reason-${item.id}`} className="text-xs text-amber-700">
              No reason yet
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {item.rejectReasonCodes.filter(isReasonLabelled).map((reason) => {
              const chosen = item.reasonCode === reason

              return (
                <button
                  key={reason}
                  type="button"
                  data-testid={`triage-history-reason-${item.id}-${reason}`}
                  aria-pressed={chosen}
                  disabled={disabled}
                  onClick={() => onSetReason(item.id, chosen ? null : reason)}
                  className={`${CHIP_CLASS} ${chosen ? 'bg-neutral-900 text-white hover:bg-neutral-900' : ''}`}
                >
                  {KNOWLEDGE_BIT_REJECT_REASON_LABELS[reason]}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </li>
  )
}
