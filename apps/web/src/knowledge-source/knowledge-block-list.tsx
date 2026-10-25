import { Tabs } from '../ui/tabs'
import type { Block, BlockType } from './knowledge-form-blocks'
import { DuplicateSourceWarning } from './duplicate-source-warning'
import type { EarlierSource } from './submit-knowledge-blocks'

interface KnowledgeBlockListProps {
  blocks: Block[]
  busy: boolean
  duplicates: Record<number, EarlierSource>
  blockReasons: Record<number, string>
  onValueChange: (index: number, value: string) => void
  onTypeChange: (index: number, type: BlockType) => void
  onRemove: (index: number) => void
  onAddAgain: (index: number) => void
}

export function KnowledgeBlockList({
  blocks,
  busy,
  duplicates,
  blockReasons,
  onValueChange,
  onTypeChange,
  onRemove,
  onAddAgain,
}: KnowledgeBlockListProps) {
  return (
    <>
      {blocks.map((block, index) => (
        <div key={index} className="space-y-3">
          <Tabs<BlockType>
            ariaLabel={`Source type, block ${index + 1}`}
            tabs={[
              { id: 'text', label: 'Paste text', testId: `knowledge-block-type-text-${index}` },
              { id: 'url', label: 'Add link', testId: `knowledge-block-type-url-${index}` },
            ]}
            value={block.type}
            disabled={busy}
            onChange={(type) => onTypeChange(index, type)}
          >
            {block.type === 'text' ? (
              <textarea
                aria-label={`Text to learn from, block ${index + 1}`}
                value={block.value}
                disabled={busy}
                onChange={(event) => onValueChange(index, event.target.value)}
                placeholder="Paste a block of prose to learn from…"
                rows={6}
                data-testid={`knowledge-block-input-${index}`}
                className="w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50"
              />
            ) : (
              <input
                type="url"
                aria-label={`Article link, block ${index + 1}`}
                value={block.value}
                disabled={busy}
                onChange={(event) => onValueChange(index, event.target.value)}
                placeholder="https://example.com/article"
                data-testid={`knowledge-block-input-${index}`}
                className="min-h-[44px] w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-neutral-500 disabled:opacity-50 sm:min-h-0"
              />
            )}
          </Tabs>

          {duplicates[index] && (
            <DuplicateSourceWarning
              index={index}
              earlier={duplicates[index]}
              disabled={busy}
              onAddAgain={() => onAddAgain(index)}
            />
          )}

          {blockReasons[index] && !duplicates[index] && (
            <p data-testid={`knowledge-block-error-${index}`} className="text-sm text-red-700">
              {blockReasons[index]}
            </p>
          )}

          {index > 0 && (
            <button
              type="button"
              aria-label={`Remove block ${index + 1}`}
              disabled={busy}
              onClick={() => onRemove(index)}
              data-testid={`knowledge-remove-block-button-${index}`}
              className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      ))}
    </>
  )
}
