import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { buildSubjectPathLabel } from '@post-anki/core'
import { KNOWLEDGE_SOURCE_TRUNCATED_NOTICE } from '@post-anki/shared'
import type { KnowledgeItemModelId, SubjectCheckNewSubject } from '@post-anki/shared'

import { mapSubjectRow, subjectsCollection } from '../curriculum/board.collection'
import { ExtractionModelSelect } from '../knowledge-bit/extraction-model-select'
import { SubjectCombobox } from '../ui/subject-combobox'
import { notifyPendingReviewChanged } from '../knowledge-bit/knowledge-bit-review-events'

import { emptyBlock, failedBlocksMessage, remapByPosition } from './knowledge-form-blocks'
import type { Block, BlockType } from './knowledge-form-blocks'
import { KnowledgeBlockList } from './knowledge-block-list'
import { createProposedSubject } from './create-proposed-subject'
import { SubjectCheckPanel, UnfiledNotice } from './subject-check-panel'
import { useSubjectCheck } from './use-subject-check'
import { submitKnowledgeBlocks } from './submit-knowledge-blocks'
import type { EarlierSource, SubmittedBlock } from './submit-knowledge-blocks'

export function AddKnowledgeForm({ initialSubjectId }: { initialSubjectId?: string }) {
  const [blocks, setBlocks] = useState<Block[]>([emptyBlock()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockReasons, setBlockReasons] = useState<Record<number, string>>({})
  const [duplicates, setDuplicates] = useState<Record<number, EarlierSource>>({})
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [unfiledNotice, setUnfiledNotice] = useState(false)
  const subjectFieldRef = useRef<HTMLLabelElement>(null)
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
    .map((block, index) => ({ index, type: block.type, value: block.value.trim(), force: block.force }))
    .filter((block) => block.value.length > 0)

  const subjectCheck = useSubjectCheck({
    blocks: nonEmptyBlocks,
    chosenSubjectId: selectedSubjectId,
    preselectedSubjectId: initialSubjectId,
    preselectedIsParent: subjects.some((subject) => subject.parentId === initialSubjectId),
  })
  const checking = subjectCheck.state.status === 'checking'
  const panelOpen = subjectCheck.state.status === 'advice' && subjectCheck.state.response.status === 'ok'
  const canSubmit = nonEmptyBlocks.length > 0 && !busy && !checking && !panelOpen

  function updateBlockValue(index: number, value: string) {
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, value, force: undefined } : block)))
    setDuplicates((current) => Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== index)))
  }

  function updateBlockType(index: number, type: BlockType) {
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, type } : block)))
  }

  function addBlock() {
    setBlocks((current) => [...current, emptyBlock()])
  }

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, i) => i !== index))
    setBlockReasons({})
    setDuplicates({})
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void checkThenSend()
  }

  async function checkThenSend() {
    if (nonEmptyBlocks.length === 0) {
      return
    }

    if (!subjectCheck.needsCheck) {
      await send(nonEmptyBlocks)

      return
    }

    setSuccessMessage(null)
    setUnfiledNotice(false)

    const result = await subjectCheck.runCheck()
    const hasAdvice =
      result.status === 'advice' &&
      result.response.status === 'ok' &&
      (result.response.recommendations.length > 0 || result.response.newSubject !== null)

    if (!hasAdvice) {
      await send(nonEmptyBlocks, { notice: result.status !== 'dismissed' })
    }
  }

  function acceptSuggestion(chosenId: string) {
    setSubjectId(chosenId)
    void send(nonEmptyBlocks, { subjectId: chosenId })
  }

  async function createAndAdd(proposal: SubjectCheckNewSubject) {
    setBusy(true)
    setError(null)

    try {
      const createdId = await createProposedSubject(proposal)

      setSubjectId(createdId)
      await send(nonEmptyBlocks, { subjectId: createdId })
    } catch {
      setError('Could not create the subject. Pick another subject or add without one.')
      setBusy(false)
    }
  }

  function pickAnother() {
    subjectCheck.dismiss()
    subjectFieldRef.current?.querySelector('input')?.focus()
  }

  function addWithoutSubject() {
    subjectCheck.dismiss()
    void send(nonEmptyBlocks)
  }

  function addAgain(index: number) {
    setBlocks((current) => current.map((block, i) => (i === index ? { ...block, force: true } : block)))
    void send(nonEmptyBlocks.map((block) => (block.index === index ? { ...block, force: true } : block)))
  }

  async function send(toSend: SubmittedBlock[], options: { subjectId?: string; notice?: boolean } = {}) {
    if (toSend.length === 0) {
      return
    }

    setBusy(true)
    setError(null)
    setBlockReasons({})
    setDuplicates({})
    setSuccessMessage(null)

    const { createdCount, truncatedCount, failedReasons, duplicates: earlier } = await submitKnowledgeBlocks(toSend, {
      subjectId: options.subjectId ?? (selectedSubjectId || undefined),
      modelId: modelId || undefined,
    })

    if (createdCount > 0) {
      notifyPendingReviewChanged()
      setUnfiledNotice(options.notice === true)
      const addedText =
        createdCount === 1 ? 'Added.' : `${createdCount} knowledge sources added.`
      const truncatedText = truncatedCount > 0 ? ` ${KNOWLEDGE_SOURCE_TRUNCATED_NOTICE}` : ''
      setSuccessMessage(
        `${addedText}${truncatedText} Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.`,
      )
    }

    const failedIndices = [...failedReasons.keys()].sort((x, y) => x - y)

    if (failedIndices.length > 0) {
      setError(failedBlocksMessage(failedIndices.length))
    }

    if (failedIndices.length === 0) {
      setBlocks([emptyBlock()])
      setBlockReasons({})
    } else {
      setBlocks((current) => current.filter((_, index) => failedReasons.has(index)))
      setDuplicates(remapByPosition(failedIndices, earlier))
      setBlockReasons(remapByPosition(failedIndices, failedReasons))
    }

    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="knowledge-add-form">
      <label ref={subjectFieldRef} className="flex items-center gap-2 text-sm text-neutral-700">
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

      <KnowledgeBlockList
        blocks={blocks}
        busy={busy}
        duplicates={duplicates}
        blockReasons={blockReasons}
        onValueChange={updateBlockValue}
        onTypeChange={updateBlockType}
        onRemove={removeBlock}
        onAddAgain={addAgain}
      />

      <SubjectCheckPanel
        state={subjectCheck.state}
        busy={busy}
        onUse={acceptSuggestion}
        onCreate={(proposal) => void createAndAdd(proposal)}
        onPickAnother={pickAnother}
        onAddWithoutSubject={addWithoutSubject}
      />

      <div className="flex flex-wrap items-center gap-3">
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
          {busy ? 'Saving…' : checking ? 'Checking…' : 'Add knowledge'}
        </button>
      </div>

      {successMessage && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p data-testid="knowledge-success-message" className="text-green-700">
            {successMessage}
          </p>
          <Link
            to="/knowledge-bit-review"
            data-testid="knowledge-success-review-link"
            className="text-neutral-700 underline"
          >
            Knowledge triage
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

      {successMessage && unfiledNotice && <UnfiledNotice />}

      {error && (
        <p data-testid="knowledge-error-message" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}
