export function CardContextLine({ context, testId }: { context: string | null | undefined; testId?: string }) {
  const text = context?.trim()

  if (!text) {
    return null
  }

  return (
    <p data-testid={testId ?? 'card-context-line'} className="whitespace-pre-line text-xs text-neutral-500">
      {text}
    </p>
  )
}
