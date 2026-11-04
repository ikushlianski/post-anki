import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { SubjectReviewDueCounts } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  getBoard: vi.fn(),
  getSubjectReviewDueCounts: vi.fn(),
}))
vi.mock('../home/home.api', () => ({ getStudyOverview: vi.fn() }))
vi.mock('../curriculum/stats.api', () => ({ getStreak: vi.fn() }))
vi.mock('../curriculum/api-client', () => ({ listCourseRefocusSuggestions: vi.fn() }))
vi.mock('../learning-path/learning-path.api', () => ({ listLearningPaths: vi.fn() }))
vi.mock('../study-session/study-session.api', () => ({ listStudySessions: vi.fn() }))
vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: {},
  curriculumSourcesCollection: {},
  subjectsCollection: {},
  mapCurriculumRow: vi.fn(),
  mapSubjectRow: vi.fn(),
}))
vi.mock('../shared/browser-time-zone', () => ({
  browserTimeZone: () => 'Europe/Berlin',
}))
vi.mock('../dashboard/dashboard-view', () => ({ DashboardView: () => null }))

import type { Subject } from '../curriculum/model'
import type { StudyOverview } from '@post-anki/shared'
import type { LoadResult } from '../shared/load-result'
import { getBoard, getSubjectReviewDueCounts } from '../curriculum/curriculum.api'
import { getStudyOverview } from '../home/home.api'
import { listCourseRefocusSuggestions } from '../curriculum/api-client'
import { getStreak } from '../curriculum/stats.api'
import { listLearningPaths } from '../learning-path/learning-path.api'
import { listStudySessions } from '../study-session/study-session.api'
import {
  dashboardCurricula,
  dashboardStreak,
  dashboardSubjects,
} from '../mocks/dashboard.mock'
import { Route } from './index'

interface DashboardLoaderData {
  subjects: Subject[]
  studyOverview: LoadResult<StudyOverview>
  subjectDueCounts: LoadResult<SubjectReviewDueCounts>
}

const OVERVIEW: StudyOverview = {
  counts: { new: 2, learning: 1, review: 3 },
  reviewedToday: 4,
  activity: [{ date: '2026-10-26', count: 4 }],
  nextDueAt: null,
  hasCards: true,
}

const LIVE_COUNTS: SubjectReviewDueCounts = {
  subjects: [{ subjectId: 'subject-business', dueCount: 3, newCount: 1 }],
  unsorted: { dueCount: 2, newCount: 0 },
  newRemainingToday: 5,
}

function runLoader(): Promise<DashboardLoaderData> {
  const { loader } = (Route as unknown as {
    options: { loader: () => Promise<DashboardLoaderData> }
  }).options

  return loader()
}

beforeEach(() => {
  vi.mocked(getBoard).mockResolvedValue({
    subjects: dashboardSubjects,
    curricula: dashboardCurricula,
    categories: [],
  })
  vi.mocked(listCourseRefocusSuggestions).mockResolvedValue([])
  vi.mocked(listStudySessions).mockResolvedValue([])
  vi.mocked(listLearningPaths).mockResolvedValue([])
  vi.mocked(getStreak).mockResolvedValue(dashboardStreak)
  vi.mocked(getStudyOverview).mockResolvedValue(OVERVIEW)
  vi.mocked(getSubjectReviewDueCounts).mockResolvedValue(LIVE_COUNTS)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('home route loader', () => {
  it('should request the due counts for the browser time zone', async () => {
    await runLoader()

    expect(getSubjectReviewDueCounts).toHaveBeenCalledWith({ data: { tz: 'Europe/Berlin' } })
  })

  it('should start the due counts request in the same batch as the board request', () => {
    void runLoader()

    expect(getBoard).toHaveBeenCalledTimes(1)
    expect(getSubjectReviewDueCounts).toHaveBeenCalledTimes(1)
  })

  it('should hand the due counts to the home page as a successful load result', async () => {
    const data = await runLoader()

    expect(data.subjectDueCounts).toEqual({ ok: true, data: LIVE_COUNTS })
  })

  it('should keep the rest of the home page when the due counts request fails', async () => {
    vi.mocked(getSubjectReviewDueCounts).mockRejectedValue(new Error('network down'))

    const data = await runLoader()

    expect(data.subjectDueCounts).toEqual({ ok: false })
    expect(data.subjects).toEqual(dashboardSubjects)
    expect(data.studyOverview).toEqual({ ok: true, data: OVERVIEW })
  })

  it('should request the study overview for the browser time zone', async () => {
    await runLoader()

    expect(getStudyOverview).toHaveBeenCalledWith({ data: { tz: 'Europe/Berlin' } })
  })

  it('should keep the rest of the home page when the study overview request fails', async () => {
    vi.mocked(getStudyOverview).mockRejectedValue(new Error('network down'))

    const data = await runLoader()

    expect(data.studyOverview).toEqual({ ok: false })
    expect(data.subjects).toEqual(dashboardSubjects)
  })
})
