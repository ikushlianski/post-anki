// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Source } from './model'
import { SourceApprovalPanel } from './source-approval-panel'
import { approveSources } from './curriculum.api'

const invalidate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  addSourcesToCurriculum: vi.fn(),
  approveSources: vi.fn(),
  removeSource: vi.fn(),
}))

const mockedApproveSources = vi.mocked(approveSources)

const CURRICULUM_ID = 'cur_1'

function pendingSource(): Source {
  return {
    id: 'src_1',
    curriculumId: CURRICULUM_ID,
    kind: 'link',
    value: 'https://example.com/a',
    title: 'A trustworthy source',
    approvalStatus: 'pending',
  }
}

function renderPanel(sources: Source[]) {
  return render(<SourceApprovalPanel curriculumId={CURRICULUM_ID} sources={sources} />)
}

describe('SourceApprovalPanel.approve', () => {
  beforeEach(() => {
    invalidate.mockClear()
    mockedApproveSources.mockReset()
  })

  afterEach(cleanup)

  it('keeps the button reading Generating… for the whole invalidate call, never re-arming mid-flight', async () => {
    mockedApproveSources.mockResolvedValue({ ok: true })
    invalidate.mockReturnValue(new Promise<void>(() => {}))

    renderPanel([pendingSource()])

    await act(async () => {
      fireEvent.click(screen.getByTestId('source-approval-approve'))
    })

    expect(mockedApproveSources).toHaveBeenCalledWith({
      data: { curriculumId: CURRICULUM_ID, override: false },
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('source-approval-approve').textContent).toBe('Generating…')
    expect(screen.getByTestId('source-approval-approve').hasAttribute('disabled')).toBe(true)
  })

  it('re-enables the button and explains itself when a second approve is rejected as not_awaiting_approval', async () => {
    mockedApproveSources.mockResolvedValue({ ok: false, code: 'not_awaiting_approval' })

    renderPanel([pendingSource()])

    await act(async () => {
      fireEvent.click(screen.getByTestId('source-approval-approve'))
    })

    expect(invalidate).not.toHaveBeenCalled()
    expect(screen.getByTestId('source-approval-approve').hasAttribute('disabled')).toBe(false)
    expect(screen.getByTestId('source-approval-approve').textContent).toBe('Approve & generate')
    expect(screen.getByText(/already generating/i)).toBeTruthy()
  })

  it('clears busy and shows a generic explanation for an unexpected failure', async () => {
    mockedApproveSources.mockRejectedValue(new Error('network down'))

    renderPanel([pendingSource()])

    await act(async () => {
      fireEvent.click(screen.getByTestId('source-approval-approve'))
    })

    expect(screen.getByTestId('source-approval-approve').hasAttribute('disabled')).toBe(false)
    expect(screen.getByText(/couldn't approve sources/i)).toBeTruthy()
  })
})
