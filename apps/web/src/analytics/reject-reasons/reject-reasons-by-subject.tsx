import type { RejectReasonSubject } from '@post-anki/shared'

export function RejectReasonsBySubject({ bySubject }: { bySubject: RejectReasonSubject[] }) {
  return (
    <div data-testid="reject-by-subject" className="mt-6">
      <h3 className="mb-2 text-sm font-medium">Reject rate per subject</h3>
      {bySubject.length === 0 ? (
        <p data-testid="reject-by-subject-empty" className="text-sm text-neutral-500">
          Not enough decisions yet
        </p>
      ) : (
        <ol className="space-y-2">
          {bySubject.map(({ subjectName, rejected, decided, rejectRate }) => (
            <li key={subjectName} data-testid="reject-by-subject-row" className="flex items-center gap-3 text-sm">
              <span className="w-64 shrink-0 truncate text-neutral-600">{subjectName}</span>
              <svg aria-hidden="true" viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 flex-1">
                <rect x={0} y={0} width={100} height={8} className="fill-neutral-100" />
                <rect x={0} y={0} width={rejectRate * 100} height={8} className="fill-neutral-800" />
              </svg>
              <span className="w-32 text-right tabular-nums">
                {rejected} of {decided} rejected
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
