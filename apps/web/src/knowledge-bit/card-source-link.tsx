import { toSafeLink } from './ai-label-badge'

export function CardSourceLink({
  sourceLinks = [],
  testId = 'card-source-link',
}: {
  sourceLinks?: readonly string[]
  testId?: string
}) {
  const link = sourceLinks.map(toSafeLink).find((candidate) => candidate !== null)

  if (!link) {
    return null
  }

  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      aria-label={`Source: ${link.host}`}
      className="text-xs text-indigo-600 underline hover:text-indigo-800"
    >
      Source: {link.host}
    </a>
  )
}
