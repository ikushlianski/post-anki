interface SafeSourceLink {
  href: string
  host: string
}

export function toSafeLink(raw: string): SafeSourceLink | null {
  try {
    const url = new URL(raw)

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }

    return { href: url.href, host: url.hostname }
  } catch {
    return null
  }
}

export function AiLabelBadge({
  isAiGenerated,
  sourceLinks = [],
  testIdSuffix = '',
}: {
  isAiGenerated: boolean
  sourceLinks?: readonly string[]
  testIdSuffix?: string
}) {
  if (!isAiGenerated) {
    return null
  }

  const links = sourceLinks
    .map(toSafeLink)
    .filter((link): link is SafeSourceLink => link !== null)
    .filter((link, index, all) => all.findIndex((other) => other.href === link.href) === index)

  return (
    <div
      data-testid={`ai-label-badge${testIdSuffix}`}
      className="flex flex-wrap items-center gap-2 text-xs text-neutral-500"
    >
      <span
        role="note"
        aria-label="AI-generated content"
        className="rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700"
      >
        AI
      </span>

      {links.length > 0 ? (
        <ul aria-label="Sources" className="flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Source: ${link.host}`}
                className="text-indigo-600 underline hover:text-indigo-800"
              >
                {link.host}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
