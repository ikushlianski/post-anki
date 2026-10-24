import { MODEL_COMPARISON_SAMPLES } from './model-comparison-samples'

export function ModelComparisonSamplesPicker({
  onPick,
  disabled,
}: {
  onPick: (text: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="comparison-sample" className="text-neutral-600">
        Or start from a sample
      </label>
      <select
        id="comparison-sample"
        data-testid="model-comparison-sample"
        value=""
        disabled={disabled}
        onChange={(event) => {
          const sample = MODEL_COMPARISON_SAMPLES.find((candidate) => candidate.id === event.target.value)

          if (sample) {
            onPick(sample.text)
          }
        }}
        className="min-h-[44px] w-full min-w-0 rounded-md bg-neutral-100/70 px-2 py-1.5 text-sm sm:min-h-0 sm:w-auto text-neutral-900 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300 disabled:opacity-50"
      >
        <option value="">Choose a sample…</option>
        {MODEL_COMPARISON_SAMPLES.map((sample) => (
          <option key={sample.id} value={sample.id}>
            {sample.label} ({sample.text.length} characters)
          </option>
        ))}
      </select>
    </div>
  )
}
