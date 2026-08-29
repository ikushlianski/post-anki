import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Level, SubjectCategory } from '../curriculum/model'
import { createCurriculum, createSubjectCategory } from '../curriculum/curriculum.api'
import { SourceRowsEditor } from '../curriculum/source-rows-editor'
import { useSourceRows } from '../curriculum/use-source-rows'
import {
  SimplifiedTechnologyFields,
  isValidHttpUrl,
} from '../curriculum/study-technology-form'
import type { EntryMode } from '../curriculum/study-technology-form'
import { CategoryTreePicker } from './category-tree-picker'

type MaterialKind = 'curriculum' | 'category'

// subject-category-nesting — the single "+ New material" entry point,
// mounted once on the subject page and once on the category page (each
// passing its own node as `defaultSelectedNodeId`). Replaces the subject
// page's old "+ Add curriculum"/"+ Study a technology" toggle pair:
// composes the same source-editing (SourceRowsEditor/useSourceRows) and
// study-a-technology (SimplifiedTechnologyFields, from study-technology-form)
// field sets those forms already use, rather than duplicating them, plus a
// category-vs-curriculum choice and the tree-position picker.
export function CreateMaterialForm({
  subjectId,
  subjectName,
  requireSources,
  categories,
  defaultSelectedNodeId = null,
}: {
  subjectId: string
  subjectName: string
  requireSources: boolean
  categories: SubjectCategory[]
  defaultSelectedNodeId?: string | null
}) {
  const router = useRouter()
  const sourceRows = useSourceRows()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<MaterialKind>('curriculum')
  const [positionId, setPositionId] = useState<string | null>(defaultSelectedNodeId)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<EntryMode>('search')
  const [docUrl, setDocUrl] = useState('')
  const [pastedMaterial, setPastedMaterial] = useState('')
  const [level, setLevel] = useState<Level | ''>('medium')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setKind('curriculum')
    setPositionId(defaultSelectedNodeId)
    setName('')
    setMode('search')
    setDocUrl('')
    setPastedMaterial('')
    setLevel('medium')
    sourceRows.reset()
    setError(null)
    setOpen(false)
  }

  const drafts = sourceRows.toDrafts()
  const sourceMandateUnmet = requireSources && drafts.length === 0

  async function submitCategory() {
    if (!name.trim()) {
      setError('Give this category a name.')
      return
    }

    setError(null)
    setBusy(true)

    try {
      await createSubjectCategory({
        data: { subjectId, name: name.trim(), parentId: positionId },
      })
      reset()
      await router.invalidate()
    } catch {
      setError("Couldn't create the category — check the position and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function submitCurriculum() {
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('Give this curriculum a name.')
      return
    }

    if (requireSources) {
      if (sourceMandateUnmet) {
        return
      }

      setError(null)
      setBusy(true)

      try {
        await createCurriculum({
          data: { subjectId, name: trimmedName, sources: drafts, categoryId: positionId },
        })
        reset()
        await router.invalidate()
      } catch {
        setError("Couldn't create the curriculum — check the details and try again.")
      } finally {
        setBusy(false)
      }

      return
    }

    if (mode === 'paste') {
      const trimmedMaterial = pastedMaterial.trim()

      if (!trimmedMaterial) {
        setError('Paste the material you already have, or switch to searching the web.')
        return
      }

      setError(null)
      setBusy(true)

      try {
        await createCurriculum({
          data: {
            subjectId,
            name: trimmedName,
            sources: [],
            docUrl: null,
            researchTopic: null,
            pastedMaterial: trimmedMaterial,
            preferredLevel: level || null,
            categoryId: positionId,
          },
        })
        reset()
        await router.invalidate()
      } catch {
        setError("Couldn't create the curriculum — check the details and try again.")
      } finally {
        setBusy(false)
      }

      return
    }

    const trimmedUrl = docUrl.trim()

    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      setError('Paste a valid documentation link (starting with http:// or https://), or leave it blank.')
      return
    }

    setError(null)
    setBusy(true)

    try {
      await createCurriculum({
        data: {
          subjectId,
          name: trimmedName,
          sources: [],
          docUrl: trimmedUrl || null,
          researchTopic: trimmedUrl ? null : trimmedName,
          preferredLevel: level || null,
          categoryId: positionId,
        },
      })
      reset()
      await router.invalidate()
    } catch {
      setError("Couldn't create the curriculum — check the details and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (kind === 'category') {
      await submitCategory()
      return
    }

    await submitCurriculum()
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid="create-material-toggle"
        onClick={() => setOpen(true)}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        + New material
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      data-testid="create-material-form"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setKind('curriculum')}
          data-testid="create-material-kind-curriculum"
          className={`rounded-md px-2 py-1 ${kind === 'curriculum' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          Curriculum
        </button>
        <button
          type="button"
          onClick={() => setKind('category')}
          data-testid="create-material-kind-category"
          className={`rounded-md px-2 py-1 ${kind === 'category' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          Category
        </button>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Where</label>
        <CategoryTreePicker
          subjectId={subjectId}
          subjectName={subjectName}
          categories={categories}
          defaultSelectedNodeId={defaultSelectedNodeId}
          value={positionId}
          onChange={setPositionId}
        />
      </div>

      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={kind === 'category' ? 'Category name…' : 'Curriculum name…'}
        autoFocus
        data-testid="create-material-name-input"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      {kind === 'curriculum' && requireSources ? (
        <>
          <SourceRowsEditor
            rows={sourceRows.rows}
            onAdd={sourceRows.addRow}
            onUpdate={sourceRows.updateRow}
            onRemove={sourceRows.removeRow}
          />
          {sourceMandateUnmet ? (
            <p className="text-xs text-amber-700" data-testid="create-material-sources-required">
              This subject requires at least one source before a curriculum can be created.
            </p>
          ) : null}
        </>
      ) : null}

      {kind === 'curriculum' && !requireSources ? (
        <SimplifiedTechnologyFields
          testIdPrefix="create-material"
          mode={mode}
          onModeChange={setMode}
          docUrl={docUrl}
          onDocUrlChange={setDocUrl}
          pastedMaterial={pastedMaterial}
          onPastedMaterialChange={setPastedMaterial}
          level={level}
          onLevelChange={setLevel}
        />
      ) : null}

      {error ? (
        <p data-testid="create-material-error" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy || (kind === 'curriculum' && requireSources && sourceMandateUnmet)}
          data-testid="create-material-submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {kind === 'category' ? 'Create category' : 'Create curriculum'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md px-4 py-2 text-sm text-neutral-500 hover:text-neutral-900"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
