import { useState } from 'react'
import type { ReactNode } from 'react'

import type { Look } from './lab-field-styles'
import { labelOf, modelLabelOf } from './lab-data'
import {
  ModelSelectListbox,
  ModelSelectNativeGrouped,
  ModelSelectNativePlain,
} from './model-select-variants'
import {
  AllowParentsCheckbox,
  SubjectSelectGrouped,
  SubjectSelectSearchable,
  SubjectSelectTwoStep,
} from './subject-select-variants'

export interface SelectorLabProps {
  disabled: boolean
  look: Look
  modelInitial: string
  subjectInitial: string
  allowParentsInitial: boolean
}

function Frame({
  title,
  blurb,
  result,
  resultId,
  children,
}: {
  title: string
  blurb: string
  result: string
  resultId: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3 rounded-xl bg-neutral-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        <p className="text-xs text-neutral-500">{blurb}</p>
      </div>
      {children}
      <p className="text-xs text-neutral-500">
        Chosen: <span data-testid={resultId} className="font-medium text-neutral-800">{result || 'nothing yet'}</span>
      </p>
    </section>
  )
}

function ModelSection({ disabled, look, initial }: { disabled: boolean; look: Look; initial: string }) {
  const [a, setA] = useState(initial)
  const [b, setB] = useState(initial)
  const [c, setC] = useState(initial)

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">Model selector</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Frame title="A. Plain select + price line" blurb="Like the app's other selects" result={modelLabelOf(a)} resultId="model-a-result">
          <ModelSelectNativePlain value={a} onChange={setA} disabled={disabled} look={look} />
        </Frame>
        <Frame title="B. Grouped select, price in each option" blurb="Native, vendors as groups" result={modelLabelOf(b)} resultId="model-b-result">
          <ModelSelectNativeGrouped value={b} onChange={setB} disabled={disabled} look={look} />
        </Frame>
        <Frame title="C. Custom list with a price column" blurb="Name left, price right, notes" result={modelLabelOf(c)} resultId="model-c-result">
          <ModelSelectListbox value={c} onChange={setC} disabled={disabled} look={look} />
        </Frame>
      </div>
    </section>
  )
}

function SubjectSection({
  disabled,
  look,
  initial,
  allowParentsInitial,
}: {
  disabled: boolean
  look: Look
  initial: string
  allowParentsInitial: boolean
}) {
  const [allowParents, setAllowParents] = useState(allowParentsInitial)
  const [a, setA] = useState(initial)
  const [b, setB] = useState(initial)
  const [c, setC] = useState(initial)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">Subject selector</h2>
        <AllowParentsCheckbox checked={allowParents} onChange={setAllowParents} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Frame title="A. Grouped select" blurb="Parents are group headings" result={labelOf(a)} resultId="subject-a-result">
          <SubjectSelectGrouped value={a} onChange={setA} disabled={disabled} look={look} allowParents={allowParents} />
        </Frame>
        <Frame title="B. Searchable list" blurb="Type to filter, path shown" result={labelOf(b)} resultId="subject-b-result">
          <SubjectSelectSearchable value={b} onChange={setB} disabled={disabled} look={look} allowParents={allowParents} />
        </Frame>
        <Frame title="C. Two steps" blurb="Top level first, then its children" result={labelOf(c)} resultId="subject-c-result">
          <SubjectSelectTwoStep value={c} onChange={setC} disabled={disabled} look={look} allowParents={allowParents} />
        </Frame>
      </div>
    </section>
  )
}

export function SelectorLab({ disabled, look, modelInitial, subjectInitial, allowParentsInitial }: SelectorLabProps) {
  return (
    <div className="mx-auto max-w-[1100px] space-y-10 p-4 sm:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Add knowledge: selector lab</h1>
        <p className="text-sm text-neutral-500">
          Compare the candidate designs. Use the toolbar viewport to switch between phone and desktop. Nothing here is wired to the app.
        </p>
      </header>
      <ModelSection key={`model-${modelInitial}`} disabled={disabled} look={look} initial={modelInitial} />
      <SubjectSection
        key={`subject-${subjectInitial}-${allowParentsInitial}`}
        disabled={disabled}
        look={look}
        initial={subjectInitial}
        allowParentsInitial={allowParentsInitial}
      />
    </div>
  )
}
