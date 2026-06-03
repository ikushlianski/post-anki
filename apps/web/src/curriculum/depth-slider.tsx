import type { Depth } from './model'
import { DEPTH_ORDER } from './model'

const DEPTHS: Depth[] = ['aware', 'working', 'deep']

const DEPTH_LABEL: Record<Depth, string> = {
  aware: 'Aware',
  working: 'Working',
  deep: 'Deep',
}

export function DepthSlider({
  value,
  onChange,
  disabled,
}: {
  value: Depth
  onChange: (depth: Depth) => void
  disabled?: boolean
}) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={DEPTH_ORDER[value]}
        disabled={disabled}
        onChange={(event) => onChange(DEPTHS[Number(event.target.value)]!)}
        className="w-full accent-neutral-900 disabled:opacity-50"
        aria-label="Target depth"
      />
      <div className="mt-1 flex justify-between text-[11px]">
        {DEPTHS.map((depth) => (
          <button
            key={depth}
            type="button"
            disabled={disabled}
            onClick={() => onChange(depth)}
            className={
              value === depth
                ? 'font-medium text-neutral-900'
                : 'text-neutral-400 hover:text-neutral-700'
            }
          >
            {DEPTH_LABEL[depth]}
          </button>
        ))}
      </div>
    </div>
  )
}
