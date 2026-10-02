import { useState } from 'react'
import type { FormEvent } from 'react'

import { createKnowledgeSource, createKnowledgeSources } from './knowledge-source.api'

export function AddKnowledgeForm() {
  const [blocks, setBlocks] = useState<string[]>([''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const nonEmptyBlocks = blocks.map((block) => block.trim()).filter((block) => block.length > 0)
  const canSubmit = nonEmptyBlocks.length > 0 && !busy

  function updateBlock(index: number, value: string) {
    setBlocks((current) => current.map((block, i) => (i === index ? value : block)))
  }

  function addBlock() {
    setBlocks((current) => [...current, ''])
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

    try {
      if (nonEmptyBlocks.length === 1) {
        await createKnowledgeSource({ data: nonEmptyBlocks[0] })
        setSuccessMessage('Knowledge source added.')
      } else {
        const created = await createKnowledgeSources({ data: nonEmptyBlocks })
        setSuccessMessage(`${created.length} knowledge sources added.`)
      }

      setBlocks([''])
    } catch {
      setError('Something went wrong adding this knowledge. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="knowledge-add-form">
      {blocks.map((block, index) => (
        <div key={index} className="space-y-1">
          <textarea
            value={block}
            onChange={(event) => updateBlock(index, event.target.value)}
            placeholder="Paste a block of prose to learn from…"
            rows={6}
            data-testid={`knowledge-block-input-${index}`}
            className="w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          {index > 0 && (
            <button
              type="button"
              onClick={() => removeBlock(index)}
              data-testid={`knowledge-remove-block-button-${index}`}
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addBlock}
          data-testid="knowledge-add-block-button"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
        >
          + Add another block
        </button>

        <button
          type="submit"
          disabled={!canSubmit}
          data-testid="knowledge-submit-button"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Add knowledge
        </button>
      </div>

      {successMessage && (
        <p data-testid="knowledge-success-message" className="text-sm text-green-700">
          {successMessage}
        </p>
      )}

      {error && (
        <p data-testid="knowledge-error-message" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}
