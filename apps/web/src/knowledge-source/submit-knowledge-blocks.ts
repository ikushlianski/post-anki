import {
  describeKnowledgeSourceRefusal,
  KNOWLEDGE_SOURCE_MAX_CHARS,
  knowledgeSourceDuplicatesFromError,
  knowledgeSourceRefusalFromError,
} from '@post-anki/shared'

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
}

export interface EarlierSource {
  sourceId: string
  addedAt: string
}

interface JobOutcome {
  created: number
  truncated: boolean
}

interface Job {
  indices: number[]
  run: () => Promise<JobOutcome>
}

export interface SubmitOutcome {
  createdCount: number
  truncatedCount: number
  failedReasons: Map<number, string | null>
  duplicates: Map<number, EarlierSource>
}

function buildJobs(
  blocks: SubmittedBlock[],
  options: { subjectId?: string; modelId?: string },
): Job[] {
  const { subjectId, modelId } = options
  const forcedTextBlocks = blocks.filter((block) => block.type === 'text' && block.force === true)
  const textBlocks = blocks.filter((block) => block.type === 'text' && block.force !== true)
  const urlBlocks = blocks.filter((block) => block.type === 'url')
  const jobs: Job[] = forcedTextBlocks.map((block) => ({
    indices: [block.index],
    run: async () => {
      await createKnowledgeSource({ data: { text: block.value, subjectId, modelId, force: true } })

      return { created: 1, truncated: false }
    },
  }))

  if (textBlocks.length === 1) {
    const [block] = textBlocks

    jobs.push({
      indices: [block.index],
      run: async () => {
        await createKnowledgeSource({ data: { text: block.value, subjectId, modelId } })

        return { created: 1, truncated: false }
      },
    })
  } else if (textBlocks.length > 1) {
    jobs.push({
      indices: textBlocks.map((block) => block.index),
      run: async () => {
        const created = await createKnowledgeSources({
          data: { texts: textBlocks.map((block) => block.value), subjectId, modelId },
        })

        return { created: created.length, truncated: false }
      },
    })
  }

  for (const block of urlBlocks) {
    jobs.push({
      indices: [block.index],
      run: async () => {
        const created = await createKnowledgeSourceFromUrl({ data: { url: block.value, subjectId, modelId, force: block.force } })

        return { created: 1, truncated: created.truncated === true }
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

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      createdCount += result.value.created
      truncatedCount += result.value.truncated ? 1 : 0

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

  return { createdCount, truncatedCount, failedReasons, duplicates }
}
