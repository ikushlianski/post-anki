import { useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { z } from 'zod'

export const searchableOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  group: z.string().optional(),
  detail: z.string().optional(),
  note: z.string().optional(),
  badge: z.string().optional(),
  disabledReason: z.string().optional(),
})

export type SearchableOption = z.infer<typeof searchableOptionSchema>

export interface SearchableSelectProps {
  options: readonly SearchableOption[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  testId?: string
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  clearable?: boolean
  className?: string
  containerClassName?: string
}

const FIELD_CLASS =
  'min-h-[44px] w-full cursor-pointer rounded-md border border-neutral-300 bg-white py-1.5 pl-3 pr-9 text-sm text-neutral-900 shadow-sm hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-60 sm:min-h-0'

const POPOVER_CLASS =
  'absolute left-0 z-30 mt-1 max-h-72 w-max min-w-full max-w-[min(30rem,calc(100vw-2rem))] overflow-auto rounded-lg bg-white p-1 shadow-lg ring-1 ring-neutral-200'

function filterOptions(options: readonly SearchableOption[], query: string | null): SearchableOption[] {
  const needle = (query ?? '').trim().toLowerCase()
  const matches =
    needle === ''
      ? [...options]
      : options.filter((option) =>
          needle.split(/\s+/).every((word) => `${option.group ?? ''} ${option.label}`.toLowerCase().includes(word)),
        )
  const order = [...new Set(matches.map((option) => option.group ?? ''))]

  return order.flatMap((group) => matches.filter((option) => (option.group ?? '') === group))
}

function nextEnabled(list: readonly SearchableOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < list.length; index += step) {
    if (!list[index]?.disabledReason) {
      return index
    }
  }

  return from
}

function optionClass(active: boolean, selected: boolean, blocked: boolean): string {
  const tone = active && !blocked ? 'bg-neutral-100' : ''
  const weight = selected ? 'font-semibold' : 'font-normal'
  const mode = blocked ? 'cursor-not-allowed text-neutral-400' : 'cursor-pointer text-neutral-900'

  return `flex min-h-[44px] items-center justify-between gap-3 rounded-md px-3 py-2 text-sm sm:min-h-9 ${tone} ${weight} ${mode}`
}

export function SearchableSelect({
  options,
  value,
  onChange,
  ariaLabel,
  testId,
  placeholder = 'Search…',
  emptyText = 'Nothing matches your search',
  disabled,
  clearable,
  className,
  containerClassName,
}: SearchableSelectProps) {
  const baseId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const selected = options.find((option) => option.id === value)
  const visible = useMemo(() => filterOptions(options, query), [options, query])

  function openList() {
    const index = visible.findIndex((option) => option.id === value)

    setActive(index >= 0 ? index : nextEnabled(visible, -1, 1))
    setOpen(true)
  }

  function close() {
    setOpen(false)
    setQuery(null)
  }

  function choose(option: SearchableOption) {
    if (option.disabledReason) {
      return
    }

    onChange(option.id)
    close()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()

      if (!open) {
        openList()

        return
      }

      setActive(nextEnabled(visible, active, event.key === 'ArrowDown' ? 1 : -1))
    } else if (event.key === 'Enter') {
      event.preventDefault()

      const option = visible[active]

      if (open && option) {
        choose(option)
      } else if (!open) {
        openList()
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      close()
    } else if (event.key === 'Tab') {
      close()
    }
  }

  function onBlur() {
    if (clearable && query !== null && query.trim() === '' && value !== '') {
      onChange('')
    }

    close()
  }

  const activeId = open && visible[active] ? `${baseId}-opt-${active}` : undefined
  let previousGroup: string | undefined

  return (
    <div className={`relative min-w-0 ${containerClassName ?? ''}`}>
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={`${baseId}-list`}
        aria-activedescendant={activeId}
        data-testid={testId}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query ?? selected?.label ?? ''}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
        }}
        onClick={() => !open && openList()}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={className ?? FIELD_CLASS}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500"
      >
        <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
      </svg>
      {open ? (
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label={ariaLabel}
          data-testid={testId ? `${testId}-list` : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => event.preventDefault()}
          className={POPOVER_CLASS}
        >
          {visible.length === 0 ? (
            <li role="presentation" data-testid={testId ? `${testId}-empty` : undefined} className="px-3 py-3 text-sm text-neutral-500">
              {emptyText}
            </li>
          ) : (
            visible.map((option, index) => {
              const showGroup = option.group !== undefined && option.group !== previousGroup

              previousGroup = option.group

              return (
                <li key={option.id} role="presentation">
                  {showGroup ? (
                    <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {option.group}
                    </div>
                  ) : null}
                  <div
                    id={`${baseId}-opt-${index}`}
                    role="option"
                    aria-selected={option.id === value}
                    aria-disabled={option.disabledReason ? true : undefined}
                    data-testid={testId ? `${testId}-option-${option.id}` : undefined}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      choose(option)
                    }}
                    onMouseEnter={() => !option.disabledReason && setActive(index)}
                    className={optionClass(index === active, option.id === value, Boolean(option.disabledReason))}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{option.label}</span>
                        {option.badge ? (
                          <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-xs font-medium text-emerald-700">
                            {option.badge}
                          </span>
                        ) : null}
                      </span>
                      {option.disabledReason ? (
                        <span className="block text-xs font-normal text-neutral-500">{option.disabledReason}</span>
                      ) : option.note ? (
                        <span className="block truncate text-xs font-normal text-neutral-500">{option.note}</span>
                      ) : null}
                    </span>
                    {option.detail ? (
                      <span className="shrink-0 text-xs font-normal text-neutral-500">{option.detail}</span>
                    ) : null}
                  </div>
                </li>
              )
            })
          )}
        </ul>
      ) : null}
    </div>
  )
}
