// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { MockExamSession } from './mock-exam-session'
import { getActiveProbeSession, prepareProbeSession } from '../curriculum/probe-session.api'
import type { ExamScopeOption } from './exam-scope-options'

vi.mock('../curriculum/probe-session.api', () => ({
  getActiveProbeSession: vi.fn(),
  prepareProbeSession: vi.fn(),
  answerProbeSession: vi.fn(),
}))

const mockedGetActiveProbeSession = vi.mocked(getActiveProbeSession)
const mockedPrepareProbeSession = vi.mocked(prepareProbeSession)

const CURRICULUM_ID = 'curr-1'
const MODULE_ID = 'module-1'

const SCOPE_OPTIONS: ExamScopeOption[] = [
  { scope: 'curriculum', scopeId: CURRICULUM_ID, label: 'This whole curriculum' },
  { scope: 'module', scopeId: MODULE_ID, label: 'Module one' },
]

function renderSession(onScopeChange = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MockExamSession
        scope="curriculum"
        scopeId={CURRICULUM_ID}
        scopeOptions={SCOPE_OPTIONS}
        onScopeChange={onScopeChange}
      />
    </QueryClientProvider>,
  )

  return { ...utils, onScopeChange }
}

describe('MockExamSession', () => {
  beforeEach(() => {
    mockedGetActiveProbeSession.mockResolvedValue(null)
    mockedPrepareProbeSession.mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('should start a curriculum-scope exam with an untouched picker, exactly like before the picker existed', async () => {
    renderSession()

    await waitFor(() => expect(screen.getByTestId('mock-exam-start')).not.toBeNull())

    fireEvent.click(screen.getByTestId('start-mock-exam'))

    await waitFor(() =>
      expect(mockedPrepareProbeSession).toHaveBeenCalledWith({
        data: {
          scope: 'curriculum',
          scopeId: CURRICULUM_ID,
          allowMultiSelect: true,
          mode: 'exam',
          targetCount: 10,
        },
      }),
    )
  })

  it('should start a module-scope exam and commit the picked scope via onScopeChange', async () => {
    mockedPrepareProbeSession.mockResolvedValue({
      id: 'sess-1',
      scope: 'module',
      scopeId: MODULE_ID,
      curriculumId: CURRICULUM_ID,
      mode: 'exam',
      status: 'active',
      total: 10,
      correct: 0,
      answered: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      questions: [],
    })

    const { onScopeChange } = renderSession()

    await waitFor(() => expect(screen.getByTestId('mock-exam-start')).not.toBeNull())

    fireEvent.click(screen.getByTestId(`exam-scope-module-${MODULE_ID}`))
    fireEvent.click(screen.getByTestId('start-mock-exam'))

    await waitFor(() =>
      expect(mockedPrepareProbeSession).toHaveBeenCalledWith({
        data: {
          scope: 'module',
          scopeId: MODULE_ID,
          allowMultiSelect: true,
          mode: 'exam',
          targetCount: 10,
        },
      }),
    )
    await waitFor(() => expect(onScopeChange).toHaveBeenCalledWith('module', MODULE_ID))
  })
})
