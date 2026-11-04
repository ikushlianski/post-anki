export function shortModelName(modelId: string): string {
  return modelId.split('/').pop() || modelId
}

export function KnowledgeBitModelBadges({ bitId, modelIds }: { bitId: string; modelIds?: string[] }) {
  if (!modelIds || modelIds.length === 0) {
    return null
  }

  return (
    <ul
      data-testid={`knowledge-bit-model-badges-${bitId}`}
      title={modelIds.join(', ')}
      aria-label="Produced by models"
      className="flex flex-wrap gap-1"
    >
      {modelIds.map((modelId) => (
        <li
          key={modelId}
          title={modelId}
          className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700"
        >
          {shortModelName(modelId)}
        </li>
      ))}
    </ul>
  )
}
