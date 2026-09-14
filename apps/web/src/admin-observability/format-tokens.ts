export function formatTokens(
  promptTokens: number | null,
  completionTokens: number | null,
  totalTokens: number | null,
): string {
  if (promptTokens === null && completionTokens === null && totalTokens === null) {
    return '—'
  }

  const prompt = promptTokens ?? '—'
  const completion = completionTokens ?? '—'
  const total = totalTokens ?? '—'

  return `${prompt} / ${completion} / ${total}`
}
