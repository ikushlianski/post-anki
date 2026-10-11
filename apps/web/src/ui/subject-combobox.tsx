import { useEffect, useId, useState } from 'react'

export interface SubjectComboboxOption {
  id: string
  label: string
}

interface SubjectComboboxProps {
  options: SubjectComboboxOption[]
  value: string
  onChange: (subjectId: string) => void
  ariaLabel: string
  testId?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

function labelFor(options: SubjectComboboxOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? ''
}

export function SubjectCombobox({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
  placeholder = 'Search subjects…',
  disabled,
  className,
}: SubjectComboboxProps) {
  const listId = useId()
  const selectedLabel = labelFor(options, value)
  const [text, setText] = useState(selectedLabel)

  useEffect(() => {
    setText(selectedLabel)
  }, [selectedLabel])

  function handleChange(next: string) {
    setText(next)

    const match = options.find((option) => option.label.toLowerCase() === next.trim().toLowerCase())

    if (match) {
      onChange(match.id)

      return
    }

    if (value !== '') {
      onChange('')
    }
  }

  return (
    <>
      <input
        type="text"
        role="combobox"
        list={listId}
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid={testId}
        autoComplete="off"
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => setText(selectedLabel)}
        className={
          className ??
          'rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-neutral-500 disabled:opacity-50'
        }
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.id} value={option.label} />
        ))}
      </datalist>
    </>
  )
}
