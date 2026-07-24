import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'

import type { Level } from './model'
import { createCurriculum } from './curriculum.api'

const LEVEL_OPTIONS: { value: Level | ''; label: string }[] = [
  { value: '', label: 'No preference' },
  { value: 'basic', label: '🔰 Basic' },
  { value: 'medium', label: '🧭 Medium' },
  { value: 'advanced', label: '🚀 Advanced' },
]

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

type EntryMode = 'search' | 'paste'

export function StudyTechnologyForm({ subjectId }: { subjectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<EntryMode>('search')
  const [name, setName] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [pastedMaterial, setPastedMaterial] = useState('')
  const [level, setLevel] = useState<Level | ''>('medium')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setMode('search')
    setName('')
    setDocUrl('')
    setPastedMaterial('')
    setLevel('medium')
    setError(null)
    setOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedUrl = docUrl.trim()
    const trimmedMaterial = pastedMaterial.trim()

    if (!trimmedName) {
      setError('Give this technology a name.')
      return
    }

    if (mode === 'paste') {
      if (!trimmedMaterial) {
        setError('Paste the material you already have, or switch to searching the web.')
        return
      }

      setError(null)
      setBusy(true)
      await createCurriculum({
        data: {
          subjectId,
          name: trimmedName,
          sources: [],
          docUrl: null,
          researchTopic: null,
          pastedMaterial: trimmedMaterial,
          preferredLevel: level || null,
        },
      })
      setBusy(false)
      reset()
      await router.invalidate()
      return
    }

    if (trimmedUrl && !isValidHttpUrl(trimmedUrl)) {
      setError('Paste a valid documentation link (starting with http:// or https://), or leave it blank.')
      return
    }

    setError(null)
    setBusy(true)
    await createCurriculum({
      data: {
        subjectId,
        name: trimmedName,
        sources: [],
        docUrl: trimmedUrl || null,
        researchTopic: trimmedUrl ? null : trimmedName,
        preferredLevel: level || null,
      },
    })
    setBusy(false)
    reset()
    await router.invalidate()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="study-technology-toggle"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        🔎 Study a technology
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      data-testid="study-technology-form"
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Technology name — e.g. Temporal…"
        autoFocus
        data-testid="study-technology-name-input"
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
      />

      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setMode('search')}
          data-testid="study-technology-mode-search"
          className={`rounded-md px-2 py-1 ${mode === 'search' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          Search for it
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          data-testid="study-technology-mode-paste"
          className={`rounded-md px-2 py-1 ${mode === 'paste' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          I already have material
        </button>
      </div>

      {mode === 'search' ? (
        <input
          value={docUrl}
          onChange={(event) => setDocUrl(event.target.value)}
          placeholder="Documentation URL (optional) — leave blank to search for it"
          data-testid="study-technology-doc-url-input"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      ) : (
        <textarea
          value={pastedMaterial}
          onChange={(event) => setPastedMaterial(event.target.value)}
          placeholder="Paste an article, notes, or a curriculum you already drafted elsewhere…"
          rows={5}
          data-testid="study-technology-paste-input"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      )}

      <select
        value={level}
        onChange={(event) => setLevel(event.target.value as Level | '')}
        data-testid="study-technology-level-select"
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
      >
        {LEVEL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-neutral-400">
        {mode === 'paste'
          ? "The mentor drafts a structure from your material plus a trusted-source web search, then you'll shape it together in a short chat before anything is finalized."
          : "No sources needed — the mentor searches for trusted material (docs site, official blogs, papers), you'll review and approve what it finds, then shape the drafted structure together in a short chat before anything is finalized."}
      </p>
      {error ? (
        <p data-testid="study-technology-error" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={busy}
          data-testid="study-technology-submit"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Starting research…' : 'Study this'}
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
