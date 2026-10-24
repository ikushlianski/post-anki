import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { POPOVER_CLASS, fieldClass, optionClass, type Look } from './lab-field-styles'

export interface ListboxItem {
  id: string
  label: string
  right?: string
  note?: string
}

interface ListboxProps {
  items: readonly ListboxItem[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  ariaLabel: string
  look: Look
  disabled?: boolean
  searchable?: boolean
  emptyText?: string
  alignRight?: boolean
}

export function Listbox({
  items,
  value,
  onChange,
  placeholder,
  ariaLabel,
  look,
  disabled,
  searchable = false,
  emptyText = 'Nothing matches',
  alignRight = false,
}: ListboxProps) {
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const selected = items.find((item) => item.id === value) ?? null

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return searchable && needle !== ''
      ? items.filter((item) => item.label.toLowerCase().includes(needle))
      : items
  }, [items, query, searchable])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function openList() {
    const index = visible.findIndex((item) => item.id === value)

    setActive(index >= 0 ? index : 0)
    setOpen(true)
  }

  function choose(item: ListboxItem) {
    onChange(item.id)
    close()
  }

  useEffect(() => {
    if (!open) {
      return
    }

    function onDown(event: MouseEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        close()
      }
    }

    document.addEventListener('mousedown', onDown)

    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) {
      document.getElementById(`${baseId}-opt-${active}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, active, baseId])

  function onKeyDown(event: KeyboardEvent) {
    const last = Math.max(visible.length - 1, 0)

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      open ? setActive(Math.min(active + 1, last)) : openList()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      open ? setActive(Math.max(active - 1, 0)) : openList()
    } else if (event.key === 'Home' && open) {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End' && open) {
      event.preventDefault()
      setActive(last)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = visible[active]

      if (open && item) {
        choose(item)
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

  const comboboxProps = {
    role: 'combobox',
    'aria-label': ariaLabel,
    'aria-expanded': open,
    'aria-haspopup': 'listbox' as const,
    'aria-controls': `${baseId}-list`,
    'aria-activedescendant': open ? `${baseId}-opt-${active}` : undefined,
    disabled,
    onKeyDown,
  }

  return (
    <div ref={rootRef} className="relative">
      {searchable ? (
        <input
          {...comboboxProps}
          type="text"
          autoComplete="off"
          value={open ? query : (selected?.label ?? '')}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onClick={() => !open && openList()}
          className={fieldClass(look)}
        />
      ) : (
        <button
          {...comboboxProps}
          type="button"
          onClick={() => (open ? close() : openList())}
          className={`${fieldClass(look)} flex items-center justify-between gap-2`}
        >
          <span className={selected ? '' : 'text-neutral-400'}>{selected?.label ?? placeholder}</span>
          {selected?.right ? <span className="text-xs text-neutral-500">{selected.right}</span> : null}
          <span aria-hidden="true" className="text-neutral-400">
            ▾
          </span>
        </button>
      )}

      {open ? (
        <ul id={`${baseId}-list`} role="listbox" aria-label={ariaLabel} className={`${POPOVER_CLASS} ${alignRight ? 'right-0' : 'left-0'}`}>
          {visible.length === 0 ? (
            <li className="px-3 py-3 text-sm text-neutral-500">{emptyText}</li>
          ) : (
            visible.map((item, index) => (
              <li
                key={item.id}
                id={`${baseId}-opt-${index}`}
                role="option"
                aria-selected={item.id === value}
                onMouseDown={(event) => {
                  event.preventDefault()
                  choose(item)
                }}
                onMouseEnter={() => setActive(index)}
                className={optionClass(index === active, item.id === value)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.note ? <span className="block truncate text-xs font-normal text-neutral-500">{item.note}</span> : null}
                </span>
                {item.right ? <span className="shrink-0 text-xs font-normal text-neutral-500">{item.right}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
