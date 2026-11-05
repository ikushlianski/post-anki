import {
  describeKnowledgeSourceRefusal,
  KNOWLEDGE_SOURCE_MAX_CHARS,
  knowledgeSourceDuplicatesFromError,
  knowledgeSourceRefusalFromError,
} from '@post-anki/shared'

import { attentionFirstWords, normalizeTargetPhrases } from '@post-anki/shared'

import type { KnowledgeHighlight } from './knowledge-highlights'
import {
  createKnowledgeSource,
  createKnowledgeSourceFromUrl,
  createKnowledgeSources,
} from './knowledge-source.api'

export interface SubmittedBlock {
  index: number
  type: 'text' | 'url'
  value: string
  force?: boolean
  targetPhrases?: string[]
  highlights?: KnowledgeHighlight[]
}

export interface EarlierSource {
  sourceId: string
  addedAt: string
}

export interface AddedSource {
  sourceId: string
  label: string
}

interface JobOutcome {
  created: number
  truncated: boolean
  added: AddedSource[]
}

function addedFrom(created: { id?: unknown } | null | undefined, label: string): AddedSource[] {
  return typeof created?.id === 'string' ? [{ sourceId: created.id, label: attentionFirstWords(label) }] : []
}

interface Job {
  indices: number[]
  run: () => Promise<JobOutcome>
}

export interface SubmitOutcome {
  createdCount: number
  truncatedCount: number
  added: AddedSource[]
  failedReasons: Map<number, string | null>
  duplicates: Map<number, EarlierSource>
}

function buildJobs(blocks: SubmittedBlock[], options: { subjectId?: string; modelId?: string }): Job[] {
  const { subjectId, modelId } = options
  const withPhrases = blocks.map((block) => ({
    block,
    targetPhrases: normalizeTargetPhrases(block.targetPhrases ?? []) ?? undefined,
    highlights: blocks.length === 1 && block.type === 'text' && block.highlights?.length ? block.highlights : undefined,
  }))
  const singleTextBlocks = withPhrases.filter(
    ({ block, targetPhrases, highlights }) => block.type === 'text' && (block.force === true || targetPhrases !== undefined || highlights !== undefined),
  )
  const batchedTextBlocks = withPhrases
    .filter(({ block, targetPhrases, highlights }) =>
        block.type === 'text' && block.force !== true && targetPhrases === undefined && highlights === undefined,
    )
    .map(({ block }) => block)
  const urlBlocks = withPhrases.filter(({ block }) => block.type === 'url')
  const jobs: Job[] = singleTextBlocks.map(({ block, targetPhrases, highlights }) => ({
    indices: [block.index],
    run: async () => {
      const created = await createKnowledgeSource({
        data: { text: block.value, subjectId, modelId, force: block.force === true ? true : undefined, targetPhrases, highlights },
      })

      return { created: 1, truncated: false, added: addedFrom(created, block.value) }
    },
  }))

  if (batchedTextBlocks.length === 1) {
    const [block] = batchedTextBlocks

    jobs.push({
      indices: [block.index],
      run: async () => {
        const created = await createKnowledgeSource({ data: { text: block.value, subjectId, modelId } })

        return { created: 1, truncated: false, added: addedFrom(created, block.value) }
      },
    })
  } else if (batchedTextBlocks.length > 1) {
    jobs.push({
      indices: batchedTextBlocks.map((block) => block.index),
      run: async () => {
        const created = await createKnowledgeSources({
          data: { texts: batchedTextBlocks.map((block) => block.value), subjectId, modelId },
        })

        const added = created.flatMap((source, i) => addedFrom(source, batchedTextBlocks[i]?.value ?? ''))

        return { created: created.length, truncated: false, added }
      },
    })
  }

  for (const { block, targetPhrases } of urlBlocks) {
    jobs.push({
      indices: [block.index],
      run: async () => {
        const created = await createKnowledgeSourceFromUrl({
          data: { url: block.value, subjectId, modelId, force: block.force, targetPhrases },
        })

        return { created: 1, truncated: created.truncated === true, added: addedFrom(created, block.value) }
      },
    })
  }

  return jobs
}

export async function submitKnowledgeBlocks(
  blocks: SubmittedBlock[],
  options: { subjectId?: string; modelId?: string },
): Promise<SubmitOutcome> {
  const failedReasons = new Map<number, string | null>()
  const duplicates = new Map<number, EarlierSource>()
  const sendable = blocks.filter((block) => {
    if (block.type === 'text' && block.value.length > KNOWLEDGE_SOURCE_MAX_CHARS) {
      failedReasons.set(block.index, describeKnowledgeSourceRefusal('text_too_long'))

      return false
    }

    return true
  })
  const jobs = buildJobs(sendable, options)
  const results = await Promise.allSettled(jobs.map((job) => job.run()))
  let createdCount = 0
  let truncatedCount = 0
  const added: AddedSource[] = []

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      createdCount += result.value.created
      truncatedCount += result.value.truncated ? 1 : 0
      added.push(...result.value.added)

      return
    }

    const code = knowledgeSourceRefusalFromError(result.reason)
    const reason = code === null ? null : describeKnowledgeSourceRefusal(code)

    jobs[i].indices.forEach((index) => failedReasons.set(index, reason))

    if (code === 'already_added') {
      for (const earlier of knowledgeSourceDuplicatesFromError(result.reason)) {
        const index = jobs[i].indices[earlier.index ?? 0]

        if (index !== undefined) {
          duplicates.set(index, { sourceId: earlier.existingId, addedAt: earlier.addedAt })
        }
      }

      jobs[i].indices.forEach((index) => {
        if (!duplicates.has(index)) {
          failedReasons.set(index, null)
        }
      })
    }
  })

  return { createdCount, truncatedCount, added, failedReasons, duplicates }
}
