export interface SubjectDeleteConfirmTestIds {
  confirm: string
  cancel: string
  error: string
}

export interface SubjectDeleteConfirmProps {
  subjectName: string
  curriculumCount: number | null
  subSubjectCount: number | null
  busy: boolean
  error: string | null
  testIds: SubjectDeleteConfirmTestIds
  onConfirm: () => void
  onCancel: () => void
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

export function describeSubjectDeleteImpact(
  curriculumCount: number | null,
  subSubjectCount: number | null,
): string[] {
  const lines: string[] = []

  if (curriculumCount === null) {
    lines.push('Its courses are still loading, so they are not counted yet.')
  } else if (curriculumCount > 0) {
    lines.push(
      `${plural(curriculumCount, 'course', 'courses')} will be deleted, with their sources and topics.`,
    )
  }

  if (subSubjectCount === null) {
    lines.push('Its sub-subjects are still loading, so they are not counted yet.')
  } else if (subSubjectCount > 0) {
    lines.push(
      `${plural(subSubjectCount, 'sub-subject', 'sub-subjects')} will move to the top level.`,
    )
  }

  if (lines.length === 0) {
    lines.push('It has no courses or sub-subjects.')
  }

  return lines
}

export function subjectDeleteConfirmLabel(curriculumCount: number | null): string {
  if (!curriculumCount) {
    return 'Delete subject'
  }

  return `Delete subject and ${plural(curriculumCount, 'course', 'courses')}`
}

export function SubjectDeleteConfirm({
  subjectName,
  curriculumCount,
  subSubjectCount,
  busy,
  error,
  testIds,
  onConfirm,
  onCancel,
}: SubjectDeleteConfirmProps) {
  const lines = describeSubjectDeleteImpact(curriculumCount, subSubjectCount)

  return (
    <div className="flex flex-col gap-2 p-2">
      <p className="text-sm font-medium text-neutral-800">Delete {subjectName}?</p>
      <ul data-testid="subject-delete-impact" className="list-disc space-y-1 pl-4 text-xs text-neutral-600">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {error ? (
        <p role="alert" data-testid={testIds.error} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-3 text-xs">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          data-testid={testIds.cancel}
          className="text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          data-testid={testIds.confirm}
          className="font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
        >
          {subjectDeleteConfirmLabel(curriculumCount)}
        </button>
      </div>
    </div>
  )
}
