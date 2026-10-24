import { KNOWLEDGE_BIT_EXPORT_FORMATS } from '@post-anki/shared'

export const KNOWLEDGE_EXPORT_PATH = '/api/knowledge-bits/export'

export function KnowledgeOverviewDownload() {
  return (
    <div data-testid="knowledge-overview-download" className="flex items-center gap-2 text-sm text-neutral-600">
      <span>Download my cards:</span>
      {KNOWLEDGE_BIT_EXPORT_FORMATS.map((format) => (
        <a
          key={format}
          href={`${KNOWLEDGE_EXPORT_PATH}?format=${format}`}
          download
          data-testid={`knowledge-overview-download-${format}`}
          className="font-medium text-neutral-900 underline underline-offset-2"
        >
          {format.toUpperCase()}
        </a>
      ))}
    </div>
  )
}
