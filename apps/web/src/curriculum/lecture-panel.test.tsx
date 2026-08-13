// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Lecture } from './model'
import { LecturePanel } from './lecture-panel'
import {
  compileLecture,
  gatherLectureSources,
  getLecture,
  listLectureSourceCandidates,
  reviewLectureSourceCandidate,
} from './lecture.api'

vi.mock('./lecture.api', () => ({
  compileLecture: vi.fn(),
  gatherLectureSources: vi.fn(),
  getLecture: vi.fn(),
  listLectureSourceCandidates: vi.fn(),
  reviewLectureSourceCandidate: vi.fn(),
}))

const mockedCompileLecture = vi.mocked(compileLecture)
const mockedGatherLectureSources = vi.mocked(gatherLectureSources)
const mockedGetLecture = vi.mocked(getLecture)
const mockedListLectureSourceCandidates = vi.mocked(listLectureSourceCandidates)
const mockedReviewLectureSourceCandidate = vi.mocked(reviewLectureSourceCandidate)

const TOPIC_ID = 'topic-1'

function readyLecture(): Lecture {
  return {
    id: 'lec-1',
    topicId: TOPIC_ID,
    title: 'TCP handshake',
    status: 'ready',
    createdAt: '2026-01-01T00:00:00.000Z',
    sections: [{ id: 'sec-1', lectureId: 'lec-1', order: 1, heading: 'Overview', body: 'Body text' }],
    citations: [],
  }
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LecturePanel topicId={TOPIC_ID} />
    </QueryClientProvider>,
  )
}

describe('LecturePanel', () => {
  beforeEach(() => {
    mockedCompileLecture.mockReset()
    mockedGatherLectureSources.mockReset()
    mockedGetLecture.mockReset()
    mockedListLectureSourceCandidates.mockReset()
    mockedReviewLectureSourceCandidate.mockReset()
    mockedListLectureSourceCandidates.mockResolvedValue([])
  })

  afterEach(cleanup)

  it('never calls compile before the user asks for a lecture, even for an eligible course', async () => {
    mockedGetLecture.mockResolvedValue(null)

    renderPanel()

    expect(await screen.findByTestId('lecture-compile-start-button')).toBeTruthy()
    expect(mockedCompileLecture).not.toHaveBeenCalled()
    expect(mockedGatherLectureSources).not.toHaveBeenCalled()
  })

  it('compiles straight away on click, without ever showing the source-approval panel', async () => {
    mockedGetLecture.mockResolvedValue(null)
    mockedCompileLecture.mockResolvedValue({
      id: 'lec-1',
      topicId: TOPIC_ID,
      title: 'TCP handshake',
      status: 'generating',
      createdAt: '2026-01-01T00:00:00.000Z',
      sections: [],
      citations: [],
    })

    renderPanel()

    await act(async () => {
      fireEvent.click(await screen.findByTestId('lecture-compile-start-button'))
    })

    expect(mockedCompileLecture).toHaveBeenCalledWith({ data: TOPIC_ID })
    expect(screen.queryByTestId('lecture-gather-sources-button')).toBeNull()
    expect(mockedGatherLectureSources).not.toHaveBeenCalled()
  })

  it('falls back to the manual gather-and-approve flow only once a direct compile click fails', async () => {
    mockedGetLecture.mockResolvedValue(null)
    mockedCompileLecture.mockRejectedValue(new Error('api POST /topics/topic-1/lecture → 400'))

    renderPanel()

    await act(async () => {
      fireEvent.click(await screen.findByTestId('lecture-compile-start-button'))
    })

    expect(await screen.findByTestId('lecture-gather-sources-button')).toBeTruthy()
  })

  it('shows the ready lecture once one already exists, without ever touching compile', async () => {
    mockedGetLecture.mockResolvedValue(readyLecture())

    renderPanel()

    expect(await screen.findByTestId('lecture-ready')).toBeTruthy()
    expect(mockedCompileLecture).not.toHaveBeenCalled()
  })

  it('still lets the manual flow approve a candidate and compile once it is shown', async () => {
    mockedGetLecture.mockResolvedValue(null)
    mockedCompileLecture.mockRejectedValueOnce(new Error('no own sources'))
    mockedGatherLectureSources.mockResolvedValue([
      {
        id: 'cand-1',
        topicId: TOPIC_ID,
        title: 'Web source',
        url: 'https://example.com/web-src',
        whySelected: 'found via web',
        reviewStatus: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    renderPanel()

    await act(async () => {
      fireEvent.click(await screen.findByTestId('lecture-compile-start-button'))
    })

    fireEvent.click(await screen.findByTestId('lecture-gather-sources-button'))

    await waitFor(() => expect(mockedGatherLectureSources).toHaveBeenCalledWith({ data: TOPIC_ID }))

    expect(await screen.findByTestId('lecture-source-candidate')).toBeTruthy()
    expect(screen.getByTestId('lecture-compile-button').hasAttribute('disabled')).toBe(true)
  })
})
