import {
  DEFAULT_HIGHLIGHT_SHORTCUT,
  HIGHLIGHT_SHORTCUT_CHOICES,
  describeHighlightShortcut,
  parseHighlightShortcut,
  serializeHighlightShortcut,
} from './highlight-shortcut'
import type { HighlightShortcut } from './highlight-shortcut'

interface HighlightShortcutSettingProps {
  shortcut: HighlightShortcut
  disabled: boolean
  onChange: (shortcut: HighlightShortcut) => void
}

export function HighlightShortcutSetting({ shortcut, disabled, onChange }: HighlightShortcutSettingProps) {
  const current = serializeHighlightShortcut(shortcut)
  const isDefault = current === serializeHighlightShortcut(DEFAULT_HIGHLIGHT_SHORTCUT)

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-700">
      <label htmlFor="knowledge-highlight-shortcut-select">Highlight shortcut</label>

      <select
        id="knowledge-highlight-shortcut-select"
        value={current}
        disabled={disabled}
        data-testid="knowledge-highlight-shortcut-select"
        onChange={(event) => onChange(parseHighlightShortcut(event.target.value) ?? DEFAULT_HIGHLIGHT_SHORTCUT)}
        className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm"
      >
        {HIGHLIGHT_SHORTCUT_CHOICES.map((choice) => (
          <option key={serializeHighlightShortcut(choice)} value={serializeHighlightShortcut(choice)}>
            {describeHighlightShortcut(choice)}
          </option>
        ))}
      </select>

      {!isDefault && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(DEFAULT_HIGHLIGHT_SHORTCUT)}
          data-testid="knowledge-highlight-shortcut-reset"
          className="text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
        >
          Reset to default
        </button>
      )}
    </div>
  )
}
