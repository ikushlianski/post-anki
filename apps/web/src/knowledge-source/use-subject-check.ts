import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SUBJECT_CHECK_MAX_BLOCKS,
  SUBJECT_CHECK_MAX_EXCERPT_CHARS,
  SUBJECT_CHECK_MAX_TOTAL_CHARS,
} from '@post-anki/shared'
import type { SubjectCheckRequest, SubjectCheckResponse, SubjectCheckUnavailableReason } from '@post-anki/shared'

import { checkKnowledgeSourceSubject } from './knowledge-source.api'
import type { BlockType } from './knowledge-form-blocks'

export interface SubjectCheckBlock {
  type: BlockType
  value: string
}

export type SubjectCheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'advice'; response: Extract<SubjectCheckResponse, { status: 'ok' | 'none' }> }
  | { status: 'unavailable'; reason: SubjectCheckUnavailableReason }
  | { status: 'dismissed' }

export interface CheckNeedInput {
  chosenSubjectId: string
  preselectedSubjectId?: string
  preselectedIsParent?: boolean
  dismissed: boolean
}

export type CheckNeed = { check: false } | { check: true; parentSubjectId?: string }

export function decideCheckNeed(input: CheckNeedInput): CheckNeed {
  if (input.dismissed) {
    return { check: false }
  }

  const scopedToParent =
    input.preselectedIsParent === true &&
    input.preselectedSubjectId !== undefined &&
    input.chosenSubjectId === input.preselectedSubjectId

  if (scopedToParent) {
    return { check: true, parentSubjectId: input.preselectedSubjectId }
  }

  return input.chosenSubjectId === '' ? { check: true } : { check: false }
}

export function buildSubjectCheckRequest(
  blocks: SubjectCheckBlock[],
  parentSubjectId?: string,
): SubjectCheckRequest | null {
  const kept: SubjectCheckBlock[] = []
  let total = 0

  for (const block of blocks) {
    const value = block.value.trim().slice(0, SUBJECT_CHECK_MAX_EXCERPT_CHARS)

    if (value.length === 0) {
      continue
    }

    if (kept.length >= SUBJECT_CHECK_MAX_BLOCKS || total + value.length > SUBJECT_CHECK_MAX_TOTAL_CHARS) {
      break
    }

    kept.push({ type: block.type, value })
    total += value.length
  }

  if (kept.length === 0) {
    return null
  }

  return parentSubjectId === undefined ? { blocks: kept } : { blocks: kept, parentSubjectId }
}

function blocksSignature(blocks: SubjectCheckBlock[]): string {
  return JSON.stringify(blocks.map((block) => [block.type, block.value]))
}

export interface UseSubjectCheckInput extends Omit<CheckNeedInput, 'dismissed'> {
  blocks: SubjectCheckBlock[]
}

export interface UseSubjectCheck {
  state: SubjectCheckState
  needsCheck: boolean
  runCheck: () => Promise<SubjectCheckState>
  dismiss: () => void
}

export function useSubjectCheck(input: UseSubjectCheckInput): UseSubjectCheck {
  const [state, setState] = useState<SubjectCheckState>({ status: 'idle' })
  const generation = useRef(0)
  const signature = blocksSignature(input.blocks)
  const need = decideCheckNeed({ ...input, dismissed: state.status === 'dismissed' })

  useEffect(() => {
    generation.current += 1
    setState({ status: 'idle' })
  }, [signature])

  const runCheck = useCallback(async (): Promise<SubjectCheckState> => {
    const request = need.check ? buildSubjectCheckRequest(input.blocks, need.parentSubjectId) : null

    if (request === null) {
      return state
    }

    const current = ++generation.current

    setState({ status: 'checking' })

    let next: SubjectCheckState

    try {
      const response = await checkKnowledgeSourceSubject({ data: request })

      next =
        response.status === 'unavailable'
          ? { status: 'unavailable', reason: response.reason }
          : { status: 'advice', response }
    } catch {
      next = { status: 'unavailable', reason: 'failed' }
    }

    if (current === generation.current) {
      setState(next)
    }

    return next
  }, [need, input.blocks, state])

  const dismiss = useCallback(() => {
    generation.current += 1
    setState({ status: 'dismissed' })
  }, [])

  return { state, needsCheck: need.check, runCheck, dismiss }
}
