import { Tabs } from '../ui/tabs'
import { LINK_ERROR_MESSAGE, isHttpUrl } from './knowledge-form-blocks'
import type { Block, BlockType } from './knowledge-form-blocks'
import { HighlightedTextField } from './highlighted-text-field'
import type { KnowledgeHighlight } from './knowledge-highlights'
import { TargetPhrasesField } from './target-phrases-field'
import { DuplicateSourceWarning } from './duplicate-source-warning'
import { ShortTextHint } from './short-text-hint'
import type { EarlierSource } from './submit-knowledge-blocks'

interface KnowledgeBlockListProps {
  blocks: Block[]
  showTargetPhrases: boolean
  busy: boolean
  duplicates: Record<number, EarlierSource>
  blockReasons: Record<number, string>
  onValueChange: (index: number, value: string) => void
  onTypeChange: (index: number, type: BlockType) => void
  onTargetPhrasesChange: (index: number, phrases: string[]) => void
  onHighlightsChange: (index: number, highlights: KnowledgeHighlight[]) => void
  onRemove: (index: number) => void
  onAddAgain: (index: number) => void
  onSubmitShortcut: () => void
}

export function KnowledgeBlockList({
  blocks,
  showTargetPhrases,
  busy,
  duplicates,
  blockReasons,
  onValueChange,
  onTypeChange,
  onTargetPhrasesChange,
  onHighlightsChange,
  onRemove,
  onAddAgain,
  onSubmitShortcut,
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
              <HighlightedTextField
                index={index}
                value={block.value}
                highlights={block.highlights ?? []}
                disabled={busy}
                highlightUnavailable={blocks.length > 1}
                onValueChange={(value) => onValueChange(index, value)}
                onHighlightsChange={(highlights) => onHighlightsChange(index, highlights)}
                onSubmitShortcut={onSubmitShortcut}
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
                className="min-h-[44px] w-full rounded-md border border-neutral-500 bg-white px-3 py-1.5 text-sm text-neutral-900 shadow-sm outline-none placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/20 disabled:bg-neutral-100 disabled:opacity-70 sm:min-h-0"
              />
            )}
          </Tabs>

          {block.type === 'url' && block.value.trim() !== '' && !isHttpUrl(block.value) && (
            <p role="alert" data-testid={`knowledge-block-link-error-${index}`} className="text-sm text-red-700">
              {LINK_ERROR_MESSAGE}
            </p>
          )}

          {block.type === 'text' && <ShortTextHint index={index} value={block.value} />}

          {showTargetPhrases && (
            <TargetPhrasesField
              blockIndex={index}
              phrases={block.targetPhrases ?? ['']}
              disabled={busy}
              onChange={(phrases) => onTargetPhrasesChange(index, phrases)}
            />
          )}

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
