import { useState } from 'react'

import { fieldClass, type Look } from './lab-field-styles'
import { Listbox, type ListboxItem } from './lab-listbox'
import { SUBJECTS, breadcrumb, childrenOf, hasChildren, parents, topLevel, topLevelLeaves } from './lab-data'

interface VariantProps {
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  look: Look
  allowParents: boolean
}

export function AllowParentsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs text-neutral-500 sm:min-h-0">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Also allow parent subjects
    </label>
  )
}

export function SubjectSelectGrouped({ value, onChange, disabled, look, allowParents }: VariantProps) {
  return (
    <select
      aria-label="Subject, grouped select"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={fieldClass(look)}
    >
      <option value="">Choose a subject</option>
      {topLevelLeaves().map((subject) => (
        <option key={subject.id} value={subject.id}>
          {subject.name}
        </option>
      ))}
      {parents().map((parent) => (
        <optgroup key={parent.id} label={parent.name}>
          {allowParents ? <option value={parent.id}>{`${parent.name} (the whole subject)`}</option> : null}
          {childrenOf(parent.id).map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function SubjectSelectSearchable({ value, onChange, disabled, look, allowParents }: VariantProps) {
  const items: ListboxItem[] = SUBJECTS.filter((subject) => allowParents || !hasChildren(subject)).map(
    (subject) => ({ id: subject.id, label: breadcrumb(subject) }),
  )

  return (
    <Listbox
      items={items}
      value={value}
      onChange={onChange}
      placeholder="Type to search subjects"
      ariaLabel="Subject, searchable list"
      disabled={disabled}
      look={look}
      searchable
      emptyText="No subject matches"
    />
  )
}

export function SubjectSelectTwoStep({ value, onChange, disabled, look, allowParents }: VariantProps) {
  const current = SUBJECTS.find((subject) => subject.id === value)
  const [topId, setTopId] = useState(current?.parentId ?? current?.id ?? '')
  const top = SUBJECTS.find((subject) => subject.id === topId)
  const kids = top ? childrenOf(top.id) : []

  function pickTop(id: string) {
    setTopId(id)

    const picked = SUBJECTS.find((subject) => subject.id === id)

    onChange(picked && !hasChildren(picked) ? picked.id : '')
  }

  return (
    <div className="space-y-2">
      <select
        aria-label="Subject, first step"
        value={topId}
        disabled={disabled}
        onChange={(event) => pickTop(event.target.value)}
        className={fieldClass(look)}
      >
        <option value="">Choose a subject</option>
        {topLevel().map((subject) => (
          <option key={subject.id} value={subject.id}>
            {hasChildren(subject) ? `${subject.name} ›` : subject.name}
          </option>
        ))}
      </select>
      {top && kids.length > 0 ? (
        <select
          aria-label="Subject, second step"
          value={value === top.id || kids.some((kid) => kid.id === value) ? value : ''}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass(look)}
        >
          <option value="">{`Choose inside ${top.name}`}</option>
          {allowParents ? <option value={top.id}>{`${top.name} (the whole subject)`}</option> : null}
          {kids.map((kid) => (
            <option key={kid.id} value={kid.id}>
              {kid.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
