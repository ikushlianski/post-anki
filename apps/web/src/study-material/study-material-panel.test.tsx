// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { StudyMaterial } from '@post-anki/shared'

import { StudyMaterialPanel } from './study-material-panel'
import { listStudyMaterials, requestStudyMaterial } from './study-material.api'

vi.mock('./study-material.api', () => ({
  listStudyMaterials: vi.fn(),
  requestStudyMaterial: vi.fn(),
}))

const mockedList = vi.mocked(listStudyMaterials)
const mockedRequest = vi.mocked(requestStudyMaterial)

function material(overrides: Partial<StudyMaterial> = {}): StudyMaterial {
  return {
    id: 'sm-1',
    topicId: 'topic-1',
    kind: 'worked_example',
    status: 'ready',
    body: 'Here is the worked example.',
    citations: [],
    failureReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <StudyMaterialPanel topicId="topic-1" />
    </QueryClientProvider>,
  )
}

describe('StudyMaterialPanel', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedRequest.mockReset()
  })

  afterEach(cleanup)

  it('should fetch history on mount but never trigger generation without a click', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [] })
    renderPanel()

    await waitFor(() => expect(mockedList).toHaveBeenCalledWith({ data: 'topic-1' }))
    expect(mockedRequest).not.toHaveBeenCalled()
  })

  it('should show the empty state until something has been requested', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [] })
    renderPanel()

    expect(await screen.findByTestId('study-material-empty')).toBeTruthy()
  })

  it('should request a worked example only when its button is clicked', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [] })
    mockedRequest.mockResolvedValue({ ok: true, data: material({ status: 'generating', body: null }) })
    renderPanel()

    await screen.findByTestId('study-material-empty')
    fireEvent.click(screen.getByTestId('study-material-request-worked_example'))

    await waitFor(() =>
      expect(mockedRequest).toHaveBeenCalledWith({
        data: { topicId: 'topic-1', kind: 'worked_example' },
      }),
    )
  })

  it('should render a generated worked example verbatim with its citations', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        material({
          citations: [{ title: 'MDN', url: 'https://developer.mozilla.org' }],
        }),
      ],
    })
    renderPanel()

    const body = await screen.findByTestId('study-material-body')

    expect(body.textContent).toBe('Here is the worked example.')
    expect(screen.getByTestId('study-material-citations')).toBeTruthy()
    expect(screen.getByText('MDN').getAttribute('href')).toBe('https://developer.mozilla.org')
  })

  it('should render no citations section when there are none', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [material({ citations: [] })] })
    renderPanel()

    await screen.findByTestId('study-material-body')

    expect(screen.queryByTestId('study-material-citations')).toBeNull()
  })

  it('should show the honest refusal reason for a failed request rather than hiding it', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        material({
          status: 'failed',
          body: null,
          failureReason: 'No usable source text was found anywhere for this topic.',
        }),
      ],
    })
    renderPanel()

    const failed = await screen.findByTestId('study-material-failed')

    expect(failed.textContent).toBe('No usable source text was found anywhere for this topic.')
  })

  it('should list multiple past materials for the same topic without overwriting', async () => {
    mockedList.mockResolvedValue({
      ok: true,
      data: [
        material({ id: 'sm-2', kind: 'analogy', body: 'second' }),
        material({ id: 'sm-1', kind: 'worked_example', body: 'first' }),
      ],
    })
    renderPanel()

    await waitFor(() =>
      expect(screen.getAllByTestId('study-material-item')).toHaveLength(2),
    )
  })
})
