import type { SelfGrade as SelfGradeValue } from './model'

const GRADES: SelfGradeValue[] = [1, 2, 3, 4, 5]

export function SelfGrade({
  value,
  onChange,
  disabled,
}: {
  value: SelfGradeValue | null
  onChange: (grade: SelfGradeValue | null) => void
  disabled?: boolean
}) {
  return (
    <div className="mt-1 flex items-center gap-1">
      {GRADES.map((grade) => (
        <button
          key={grade}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === grade ? null : grade)}
          className={`h-7 w-7 rounded-full text-sm transition-colors disabled:opacity-50 ${
            value === grade
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
          }`}
        >
          {grade}
        </button>
      ))}
    </div>
  )
}
