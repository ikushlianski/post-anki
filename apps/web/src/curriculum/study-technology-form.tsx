import type { Level } from './model'

export const LEVEL_OPTIONS: { value: Level | ''; label: string }[] = [
  { value: '', label: 'No preference' },
  { value: 'basic', label: '🔰 Basic' },
  { value: 'medium', label: '🧭 Medium' },
  { value: 'advanced', label: '🚀 Advanced' },
]

export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export type EntryMode = 'search' | 'paste'

// The "study a technology" field set — mode toggle, doc-url-or-paste input,
// level select, and the explainer paragraph telling the learner what happens
// next. Used by `CreateMaterialForm`'s simplified path
// (subject-category-nesting SCENARIO 7) instead of each subject-page flow
// duplicating its own copy. `testIdPrefix` lets a caller keep its own stable
// data-testids.
export function SimplifiedTechnologyFields({
  testIdPrefix,
  mode,
  onModeChange,
  docUrl,
  onDocUrlChange,
  pastedMaterial,
  onPastedMaterialChange,
  level,
  onLevelChange,
}: {
  testIdPrefix: string
  mode: EntryMode
  onModeChange: (mode: EntryMode) => void
  docUrl: string
  onDocUrlChange: (value: string) => void
  pastedMaterial: string
  onPastedMaterialChange: (value: string) => void
  level: Level | ''
  onLevelChange: (level: Level | '') => void
}) {
  return (
    <>
      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => onModeChange('search')}
          data-testid={`${testIdPrefix}-mode-search`}
          className={`rounded-md px-2 py-1 ${mode === 'search' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          Search for it
        </button>
        <button
          type="button"
          onClick={() => onModeChange('paste')}
          data-testid={`${testIdPrefix}-mode-paste`}
          className={`rounded-md px-2 py-1 ${mode === 'paste' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}
        >
          I already have material
        </button>
      </div>

      {mode === 'search' ? (
        <input
          value={docUrl}
          onChange={(event) => onDocUrlChange(event.target.value)}
          placeholder="Documentation URL (optional) — leave blank to search for it"
          data-testid={`${testIdPrefix}-doc-url-input`}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      ) : (
        <textarea
          value={pastedMaterial}
          onChange={(event) => onPastedMaterialChange(event.target.value)}
          placeholder="Paste an article, notes, or a curriculum you already drafted elsewhere…"
          rows={5}
          data-testid={`${testIdPrefix}-paste-input`}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
      )}

      <select
        value={level}
        onChange={(event) => onLevelChange(event.target.value as Level | '')}
        data-testid={`${testIdPrefix}-level-select`}
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
    </>
  )
}
