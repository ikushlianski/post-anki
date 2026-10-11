import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { buildSubjectPathLabel } from '@post-anki/core'
import type { KnowledgeItemModelId } from '@post-anki/shared'

import { mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import { ExtractionModelSelect } from '../knowledge-bit/extraction-model-select'
import { SubjectCombobox } from '../ui/subject-combobox'
import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'

import {
  createKnowledgeSource,
  createKnowledgeSourceFromUrl,
  createKnowledgeSources,
} from './knowledge-source.api'

type BlockType = 'text' | 'url'

interface Block {
  type: BlockType
  value: string
}

function emptyBlock(): Block {
  return { type: 'text', value: '' }
}

function modeButtonClass(selected: boolean) {
  return selected
    ? 'rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-50'
    : 'rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50'
}

function failedBlocksMessage(count: number): string {
  if (count === 1) {
    return 'Block 1 could not be added. Try again.'
  }

  const numbers = Array.from({ length: count }, (_, i) => i + 1).join(', ')

  return `Blocks ${numbers} could not be added. Try again.`
}

export function AddKnowledgeForm({ initialSubjectId }: { initialSubjectId?: string }) {
  const [blocks, setBlocks] = useState<Block[]>([emptyBlock()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? '')
  const [modelId, setModelId] = useState<KnowledgeItemModelId | ''>('')
  const subjectsQuery = useLiveQuery((q) => q.from({ subject: subjectsCollection }), [])
  const subjects = (subjectsQuery.data ?? []).map(mapSubjectRow)
  const subjectOptions = subjects
    .map((subject) => ({ id: subject.id, label: buildSubjectPathLabel(subject.id, subjects) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const selectedSubjectId = subjectOptions.some((option) => option.id === subjectId) ? subjectId : ''
  const selectedLabel = subjectOptions.find((option) => option.id === selectedSubjectId)?.label
  const preselectedLabel = subjectOptions.find((option) => option.id === initialSubjectId)?.label

  const nonEmptyBlocks = blocks
    .map((block, index) => ({ index, type: block.type, value: block.value.trim() }))
    .filter((block) => block.value.length > 0)
  const canSubmit = nonEmptyBlocks.length > 0 && !busy

  function updateBlockValue(index: number, value: string) {
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, value } : block)))
  }

  function updateBlockType(index: number, type: BlockType) {
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, type } : block)))
  }

  function addBlock() {
    setBlocks((current) => [...current, emptyBlock()])
  }

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, i) => i !== index))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (nonEmptyBlocks.length === 0) {
      return
    }

    setBusy(true)
    setError(null)
    setSuccessMessage(null)

    const textBlocks = nonEmptyBlocks.filter((block) => block.type === 'text')
    const urlBlocks = nonEmptyBlocks.filter((block) => block.type === 'url')
    const chosenSubjectId = selectedSubjectId || undefined
    const chosenModelId = modelId || undefined

    const jobs: { indices: number[]; run: () => Promise<number> }[] = []

    if (textBlocks.length === 1) {
      const [block] = textBlocks

      jobs.push({
        indices: [block.index],
        run: async () => {
          await createKnowledgeSource({ data: { text: block.value, subjectId: chosenSubjectId, modelId: chosenModelId } })
          return 1
        },
      })
    } else if (textBlocks.length > 1) {
      jobs.push({
        indices: textBlocks.map((block) => block.index),
        run: async () => {
          const created = await createKnowledgeSources({
            data: {
              texts: textBlocks.map((block) => block.value),
              subjectId: chosenSubjectId,
              modelId: chosenModelId,
            },
          })
          return created.length
        },
      })
    }

    for (const block of urlBlocks) {
      jobs.push({
        indices: [block.index],
        run: async () => {
          await createKnowledgeSourceFromUrl({ data: { url: block.value, subjectId: chosenSubjectId, modelId: chosenModelId } })
          return 1
        },
      })
    }

    const results = await Promise.allSettled(jobs.map((job) => job.run()))

    const failedIndices = new Set<number>()
    let createdCount = 0

    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        createdCount += result.value
      } else {
        jobs[i].indices.forEach((index) => failedIndices.add(index))
      }
    })

    if (createdCount > 0) {
      notifyPendingReviewChanged()
      const addedText =
        createdCount === 1 ? 'Added.' : `${createdCount} knowledge sources added.`
      setSuccessMessage(
        `${addedText} Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.`,
      )
    }

    if (failedIndices.size > 0) {
      setError(failedBlocksMessage(failedIndices.size))
    }

    if (failedIndices.size === 0) {
      setBlocks([emptyBlock()])
    } else {
      setBlocks((current) => current.filter((_, index) => failedIndices.has(index)))
    }

    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="knowledge-add-form">
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <span>Subject</span>
        <SubjectCombobox
          ariaLabel="Subject for these sources"
          options={subjectOptions}
          value={selectedSubjectId}
          disabled={busy}
          onChange={setSubjectId}
          testId="knowledge-subject-select"
          placeholder="No subject — type to search"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-neutral-700 sm:flex-row sm:items-start sm:gap-2">
        <span className="shrink-0 pt-1.5">Model</span>
        <div className="w-full max-w-xl">
          <ExtractionModelSelect
            ariaLabel="Model that will parse this knowledge"
            testId="knowledge-model-select"
            emptyLabel="Default model (set in admin settings)"
            value={modelId}
            onChange={setModelId}
            disabled={busy}
          />
        </div>
      </label>

      <p data-testid="knowledge-adding-to-label" className="-mt-1 text-sm text-neutral-600">
        Adding to: {selectedLabel ?? 'No subject'}
      </p>

      {blocks.map((block, index) => (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-pressed={block.type === 'text'}
              disabled={busy}
              onClick={() => updateBlockType(index, 'text')}
              data-testid={`knowledge-block-type-text-${index}`}
              className={modeButtonClass(block.type === 'text')}
            >
              Paste text
            </button>
            <button
              type="button"
              aria-pressed={block.type === 'url'}
              disabled={busy}
              onClick={() => updateBlockType(index, 'url')}
              data-testid={`knowledge-block-type-url-${index}`}
              className={modeButtonClass(block.type === 'url')}
            >
              Add link
            </button>
          </div>

          {block.type === 'text' ? (
            <textarea
              aria-label={`Text to learn from, block ${index + 1}`}
              value={block.value}
              disabled={busy}
              onChange={(event) => updateBlockValue(index, event.target.value)}
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
              onChange={(event) => updateBlockValue(index, event.target.value)}
              placeholder="https://example.com/article"
              data-testid={`knowledge-block-input-${index}`}
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:opacity-50"
            />
          )}

          {index > 0 && (
            <button
              type="button"
              aria-label={`Remove block ${index + 1}`}
              disabled={busy}
              onClick={() => removeBlock(index)}
              data-testid={`knowledge-remove-block-button-${index}`}
              className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={addBlock}
          data-testid="knowledge-add-block-button"
          className="inline-flex min-h-[44px] items-center rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 sm:min-h-0"
        >
          + Add another block
        </button>

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="knowledge-submit-button"
          className="inline-flex min-h-[44px] items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0"
        >
          {busy ? 'Saving…' : 'Add knowledge'}
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-3 text-sm">
          <p data-testid="knowledge-success-message" className="text-green-700">
            {successMessage}
          </p>
          <Link
            to="/knowledge-bit-review"
            data-testid="knowledge-success-review-link"
            className="text-neutral-700 underline"
          >
            Approve suggestions
          </Link>
          {preselectedLabel && initialSubjectId && (
            <Link
              to="/subject/$subjectId"
              params={{ subjectId: initialSubjectId }}
              data-testid="knowledge-success-back-link"
              className="text-neutral-700 underline"
            >
              Back to {preselectedLabel}
            </Link>
          )}
        </div>
      )}

      {error && (
        <p data-testid="knowledge-error-message" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}
