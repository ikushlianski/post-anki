import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SubjectCheckResponse } from '@post-anki/shared'

import { checkKnowledgeSourceSubject } from './knowledge-source.api'
import { buildSubjectCheckRequest, decideCheckNeed, useSubjectCheck } from './use-subject-check'
import type { SubjectCheckBlock } from './use-subject-check'

vi.mock('./knowledge-source.api', () => ({ checkKnowledgeSourceSubject: vi.fn() }))

const okResponse: SubjectCheckResponse = {
  status: 'ok',
  recommendations: [{ subjectId: 's1', subjectLabel: 'Postgres', confidence: 'high', reason: 'About indexes' }],
  newSubject: null,
}

const textBlocks: SubjectCheckBlock[] = [{ type: 'text', value: 'B-tree indexes speed up lookups' }]

describe('decideCheckNeed', () => {
  it('should skip the check when the owner already picked a subject', () => {
    expect(decideCheckNeed({ chosenSubjectId: 'a', dismissed: false })).toEqual({ check: false })
  })

  it('should skip the check when a leaf subject was preselected and kept', () => {
    expect(
      decideCheckNeed({ chosenSubjectId: 'leaf', preselectedSubjectId: 'leaf', preselectedIsParent: false, dismissed: false }),
    ).toEqual({ check: false })
  })

  it('should check with the parent as scope when a parent subject is preselected and nothing else picked', () => {
    expect(
      decideCheckNeed({ chosenSubjectId: 'par', preselectedSubjectId: 'par', preselectedIsParent: true, dismissed: false }),
    ).toEqual({ check: true, parentSubjectId: 'par' })
  })

  it('should check without scope when the subject is blank', () => {
    expect(decideCheckNeed({ chosenSubjectId: '', dismissed: false })).toEqual({ check: true })
  })

  it('should not check again after the owner declined suggestions', () => {
    expect(decideCheckNeed({ chosenSubjectId: '', dismissed: true })).toEqual({ check: false })
  })
})

describe('buildSubjectCheckRequest', () => {
  it('should return null when every block is blank', () => {
    expect(buildSubjectCheckRequest([{ type: 'text', value: '  ' }])).toBeNull()
  })

  it('should cap blocks, excerpt length and total length', () => {
    const blocks: SubjectCheckBlock[] = Array.from({ length: 8 }, () => ({ type: 'text', value: 'x'.repeat(2000) }))
    const request = buildSubjectCheckRequest(blocks)

    expect(request?.blocks).toHaveLength(2)
    expect(request?.blocks[0]?.value).toHaveLength(1500)
  })

  it('should include the parent scope only when given', () => {
    expect(buildSubjectCheckRequest(textBlocks)).toEqual({ blocks: textBlocks })
    expect(buildSubjectCheckRequest(textBlocks, 'par')).toEqual({ blocks: textBlocks, parentSubjectId: 'par' })
  })
})

describe('useSubjectCheck', () => {
  beforeEach(() => {
    vi.mocked(checkKnowledgeSourceSubject).mockReset()
  })

  function setup(initial: { blocks: SubjectCheckBlock[]; chosenSubjectId: string }) {
    return renderHook((props: { blocks: SubjectCheckBlock[]; chosenSubjectId: string }) => useSubjectCheck(props), {
      initialProps: initial,
    })
  }

  it('should send no request when a subject is already chosen', async () => {
    const { result } = setup({ blocks: textBlocks, chosenSubjectId: 'a' })

    await act(async () => {
      await result.current.runCheck()
    })

    expect(checkKnowledgeSourceSubject).not.toHaveBeenCalled()
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('should hold the advice after a successful check', async () => {
    vi.mocked(checkKnowledgeSourceSubject).mockResolvedValue(okResponse)
    const { result } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    await act(async () => {
      await result.current.runCheck()
    })

    expect(result.current.state).toEqual({ status: 'advice', response: okResponse })
  })

  it('should turn a thrown error into unavailable so adding is never blocked', async () => {
    vi.mocked(checkKnowledgeSourceSubject).mockRejectedValue(new Error('network down'))
    const { result } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    await act(async () => {
      await result.current.runCheck()
    })

    expect(result.current.state).toEqual({ status: 'unavailable', reason: 'failed' })
  })

  it('should keep the unavailable reason reported by the server', async () => {
    vi.mocked(checkKnowledgeSourceSubject).mockResolvedValue({ status: 'unavailable', reason: 'budget' })
    const { result } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    await act(async () => {
      await result.current.runCheck()
    })

    expect(result.current.state).toEqual({ status: 'unavailable', reason: 'budget' })
  })

  it('should not recheck declined text until a block is edited', async () => {
    vi.mocked(checkKnowledgeSourceSubject).mockResolvedValue(okResponse)
    const { result, rerender } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    await act(async () => {
      await result.current.runCheck()
    })
    act(() => result.current.dismiss())

    expect(result.current.needsCheck).toBe(false)

    await act(async () => {
      await result.current.runCheck()
    })

    expect(checkKnowledgeSourceSubject).toHaveBeenCalledTimes(1)

    rerender({ blocks: [{ type: 'text', value: 'edited text' }], chosenSubjectId: '' })

    expect(result.current.state).toEqual({ status: 'idle' })
    expect(result.current.needsCheck).toBe(true)
  })

  it('should clear advice when a block type changes', async () => {
    vi.mocked(checkKnowledgeSourceSubject).mockResolvedValue(okResponse)
    const { result, rerender } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    await act(async () => {
      await result.current.runCheck()
    })
    rerender({ blocks: [{ type: 'url', value: textBlocks[0]!.value }], chosenSubjectId: '' })

    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('should ignore a late answer for text that was edited meanwhile', async () => {
    let resolve: (value: SubjectCheckResponse) => void = () => undefined
    vi.mocked(checkKnowledgeSourceSubject).mockReturnValue(new Promise((r) => (resolve = r)))
    const { result, rerender } = setup({ blocks: textBlocks, chosenSubjectId: '' })

    let pending: Promise<unknown> = Promise.resolve()

    act(() => {
      pending = result.current.runCheck()
    })
    rerender({ blocks: [{ type: 'text', value: 'other text' }], chosenSubjectId: '' })
    await act(async () => {
      resolve(okResponse)
      await pending
    })

    expect(result.current.state).toEqual({ status: 'idle' })
  })
})
