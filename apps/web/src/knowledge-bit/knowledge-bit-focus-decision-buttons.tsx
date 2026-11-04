import { ButtonSpinner } from './knowledge-bit-focus-spinner'

export type FocusPressedAction = 'approve' | 'reject' | 'example'

const ACTION_CLASS =
  'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-base font-medium disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'

interface KnowledgeBitFocusDecisionButtonsProps {
  bitId: string
  isResolving: boolean
  pressed: FocusPressedAction | null
  rejectDisabled: boolean
  approveDisabled: boolean
  onPress: (action: 'approve' | 'reject') => void
  onApprove: (bitId: string) => void
  onReject: (bitId: string) => void
}

export function KnowledgeBitFocusDecisionButtons({
  bitId,
  isResolving,
  pressed,
  rejectDisabled,
  approveDisabled,
  onPress,
  onApprove,
  onReject,
}: KnowledgeBitFocusDecisionButtonsProps) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        data-testid={`knowledge-bit-focus-reject-${bitId}`}
        disabled={rejectDisabled}
        onClick={() => {
          onPress('reject')
          onReject(bitId)
        }}
        className={`${ACTION_CLASS} bg-neutral-100 text-neutral-800 hover:bg-neutral-200`}
      >
        {isResolving && pressed === 'reject' ? (
          <ButtonSpinner />
        ) : null}
        Reject
      </button>
      <button
        type="button"
        data-testid={`knowledge-bit-focus-approve-${bitId}`}
        disabled={approveDisabled}
        onClick={() => {
          onPress('approve')
          onApprove(bitId)
        }}
        className={`${ACTION_CLASS} bg-neutral-900 text-white hover:bg-neutral-800`}
      >
        Approve
        {isResolving && pressed === 'approve' ? (
          <ButtonSpinner />
        ) : null}
      </button>
    </div>
  )
}
