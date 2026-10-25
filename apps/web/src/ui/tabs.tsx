import { useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  testId?: string
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  disabled?: boolean
  panelTestId?: string
  children: ReactNode
}

function tabClass(selected: boolean): string {
  const tone = selected
    ? 'border-neutral-900 text-neutral-900'
    : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800'

  return `-mb-px min-h-[44px] border-b-2 px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 ${tone}`
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  disabled,
  panelTestId,
  children,
}: TabsProps<T>) {
  const baseId = useId()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  function move(index: number) {
    const target = tabs[(index + tabs.length) % tabs.length]

    if (!target) {
      return
    }

    onChange(target.id)
    refs.current[target.id]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move(index + 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      move(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      move(tabs.length - 1)
    }
  }

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-neutral-200">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={tab.id === value}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab.id === value ? 0 : -1}
            disabled={disabled}
            data-testid={tab.testId}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={tabClass(tab.id === value)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${value}`}
        data-testid={panelTestId}
        className="space-y-2"
      >
        {children}
      </div>
    </div>
  )
}
