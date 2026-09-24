// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { PendingPlacementSuggestion } from '@post-anki/shared'
import type { Curriculum, Subject } from '../curriculum/model'

import { PlacementSuggestionsPanel } from './placement-suggestions-panel'
import { resolvePlacementSuggestionStatus } from './knowledge-bit.api'
import { getCurriculum } from '../curriculum/curriculum.api'

vi.mock('./knowledge-bit.api', () => ({
  resolvePlacementSuggestionStatus: vi.fn(),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  getCurriculum: vi.fn(),
}))

const mockedResolve = vi.mocked(resolvePlacementSuggestionStatus)
const mockedGetCurriculum = vi.mocked(getCurriculum)

const SUBJECT: Subject = {
  id: 'sub-1',
  name: 'Web Development',
  requireSources: false,
  kind: 'architecture-mentor',
  modelTier: null,
}

const CURRICULUM: Curriculum = {
  id: 'cur-1',
  subjectId: 'sub-1',
  name: 'Turbopuffer docs',
  status: 'ready',
  learningStatus: 'not_started',
  speed: 'normal',
  hinting: true,
  defaultDepth: 'working',
  origin: 'sources',
  strictOrder: false,
  preAssessmentCompletedAt: null,
  domainNodeId: null,
  order: 0,
  modelTier: null,
  categoryId: null,
}

const SUGGESTION: PendingPlacementSuggestion = {
  id: 'kb-1',
  body: 'Turbopuffer uses a WAL-first design so writes are durable before indexing.',
  placementSuggestion: 'No existing topic covers WAL-first durability.',
}

function renderPanel(suggestions: PendingPlacementSuggestion[] = [SUGGESTION]) {
  return render(
    <PlacementSuggestionsPanel
      initialSuggestions={suggestions}
      subjects={[SUBJECT]}
      curricula={[CURRICULUM]}
    />,
  )
}

async function pickModule() {
  fireEvent.change(screen.getByTestId('placement-suggestion-subject-kb-1'), {
    target: { value: 'sub-1' },
  })
  fireEvent.change(screen.getByTestId('placement-suggestion-curriculum-kb-1'), {
    target: { value: 'cur-1' },
  })

  await waitFor(() => expect(mockedGetCurriculum).toHaveBeenCalledWith({ data: 'cur-1' }))
  await waitFor(() => {
    expect(
      (screen.getByTestId('placement-suggestion-module-kb-1') as HTMLSelectElement).disabled,
    ).toBe(false)
  })

  fireEvent.change(screen.getByTestId('placement-suggestion-module-kb-1'), {
    target: { value: 'mod-1' },
  })
}

describe('PlacementSuggestionsPanel', () => {
  beforeEach(() => {
    mockedResolve.mockReset()
    mockedGetCurriculum.mockReset()
    mockedGetCurriculum.mockResolvedValue({
      curriculum: CURRICULUM,
      sources: [],
      modules: [{ id: 'mod-1', curriculumId: 'cur-1', title: 'Indexing', order: 0 } as never],
      progress: {} as never,
      recommendedTopicId: null,
      hasCitableSources: false,
    } as never)
  })

  afterEach(() => {
    cleanup()
  })

  it('defaults the title field from the placement suggestion text', () => {
    renderPanel()

    const title = screen.getByTestId('placement-suggestion-title-kb-1') as HTMLInputElement
    expect(title.value).toBe('No existing topic covers WAL-first durability.')
  })

  it('shows an empty state when there are no pending suggestions', () => {
    renderPanel([])

    expect(screen.getByTestId('placement-suggestions-empty-state')).toBeDefined()
  })

  it('keeps accept disabled until a module is picked, even with a title present', async () => {
    renderPanel()

    const accept = screen.getByTestId('placement-suggestion-accept-kb-1') as HTMLButtonElement
    expect(accept.disabled).toBe(true)

    await pickModule()

    expect(accept.disabled).toBe(false)
  })

  it('keeps accept disabled when the title is cleared, even with a module picked', async () => {
    renderPanel()
    await pickModule()

    fireEvent.change(screen.getByTestId('placement-suggestion-title-kb-1'), {
      target: { value: '   ' },
    })

    const accept = screen.getByTestId('placement-suggestion-accept-kb-1') as HTMLButtonElement
    expect(accept.disabled).toBe(true)
  })

  it('leaves the module dropdown enabled-but-empty when loading the curriculum fails, instead of stuck disabled', async () => {
    mockedGetCurriculum.mockRejectedValue(new Error('network error'))

    renderPanel()

    fireEvent.change(screen.getByTestId('placement-suggestion-subject-kb-1'), {
      target: { value: 'sub-1' },
    })
    fireEvent.change(screen.getByTestId('placement-suggestion-curriculum-kb-1'), {
      target: { value: 'cur-1' },
    })

    await waitFor(() => {
      expect(
        (screen.getByTestId('placement-suggestion-module-kb-1') as HTMLSelectElement).disabled,
      ).toBe(false)
    })

    expect(screen.getByTestId('placement-suggestion-module-kb-1').textContent).toContain(
      'Module…',
    )
  })

  it('keeps a second row\'s module dropdown disabled on its own curriculum load, unaffected by a different row finishing first', async () => {
    const CURRICULUM_2: Curriculum = { ...CURRICULUM, id: 'cur-2', name: 'Second curriculum' }
    const SUGGESTION_2: PendingPlacementSuggestion = {
      id: 'kb-2',
      body: 'Second bit.',
      placementSuggestion: 'Second suggestion text.',
    }

    let resolveSecond: (() => void) | undefined
    mockedGetCurriculum.mockImplementation((opts: { data: string }) => {
      if (opts.data === 'cur-1') {
        return Promise.resolve({
          curriculum: CURRICULUM,
          sources: [],
          modules: [{ id: 'mod-1', curriculumId: 'cur-1', title: 'Indexing', order: 0 } as never],
          progress: {} as never,
          recommendedTopicId: null,
          hasCitableSources: false,
        } as never)
      }

      return new Promise((resolve) => {
        resolveSecond = () =>
          resolve({
            curriculum: CURRICULUM_2,
            sources: [],
            modules: [],
            progress: {} as never,
            recommendedTopicId: null,
            hasCitableSources: false,
          } as never)
      })
    })

    render(
      <PlacementSuggestionsPanel
        initialSuggestions={[SUGGESTION, SUGGESTION_2]}
        subjects={[SUBJECT]}
        curricula={[CURRICULUM, CURRICULUM_2]}
      />,
    )

    fireEvent.change(screen.getByTestId('placement-suggestion-subject-kb-2'), {
      target: { value: 'sub-1' },
    })
    fireEvent.change(screen.getByTestId('placement-suggestion-curriculum-kb-2'), {
      target: { value: 'cur-2' },
    })

    await pickModule()

    expect(
      (screen.getByTestId('placement-suggestion-module-kb-2') as HTMLSelectElement).disabled,
    ).toBe(true)

    resolveSecond?.()

    await waitFor(() => {
      expect(
        (screen.getByTestId('placement-suggestion-module-kb-2') as HTMLSelectElement).disabled,
      ).toBe(false)
    })
  })

  it('sends the picked moduleId and trimmed title, shows a confirmation naming the topic and module, removes the row', async () => {
    mockedResolve.mockResolvedValue({ outcome: 'accepted', topicId: 'top-1' })

    renderPanel()
    await pickModule()

    screen.getByTestId('placement-suggestion-accept-kb-1').click()

    await waitFor(() => {
      expect(screen.queryByTestId('placement-suggestion-kb-1')).toBeNull()
    })

    expect(mockedResolve).toHaveBeenCalledWith({
      data: {
        bitId: 'kb-1',
        status: 'accepted',
        moduleId: 'mod-1',
        title: 'No existing topic covers WAL-first durability.',
      },
    })
    expect(
      screen.getByText('Topic "No existing topic covers WAL-first durability." created under Indexing'),
    ).toBeDefined()
  })

  it('sends exactly one accept request when the button is double-clicked', async () => {
    let resolveRequest: (() => void) | undefined
    mockedResolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = () => resolve({ outcome: 'accepted', topicId: 'top-1' })
        }),
    )

    renderPanel()
    await pickModule()

    const accept = screen.getByTestId('placement-suggestion-accept-kb-1')
    accept.click()
    accept.click()

    expect(mockedResolve).toHaveBeenCalledTimes(1)

    resolveRequest?.()

    await waitFor(() => {
      expect(screen.queryByTestId('placement-suggestion-kb-1')).toBeNull()
    })
  })

  it('removes the row on accept returning already_resolved, with no confirmation shown', async () => {
    mockedResolve.mockResolvedValue({ outcome: 'already_resolved' })

    renderPanel()
    await pickModule()

    screen.getByTestId('placement-suggestion-accept-kb-1').click()

    await waitFor(() => {
      expect(screen.queryByTestId('placement-suggestion-kb-1')).toBeNull()
    })

    expect(screen.queryByText(/created under/)).toBeNull()
  })

  it('removes the row on reject with no confirmation shown', async () => {
    mockedResolve.mockResolvedValue({ outcome: 'rejected' })

    renderPanel()

    screen.getByTestId('placement-suggestion-reject-kb-1').click()

    await waitFor(() => {
      expect(screen.queryByTestId('placement-suggestion-kb-1')).toBeNull()
    })

    expect(mockedResolve).toHaveBeenCalledWith({
      data: { bitId: 'kb-1', status: 'rejected' },
    })
    expect(screen.queryByText(/created under/)).toBeNull()
  })

  it('removes the row on reject returning already_resolved exactly as on a normal resolve', async () => {
    mockedResolve.mockResolvedValue({ outcome: 'already_resolved' })

    renderPanel()

    screen.getByTestId('placement-suggestion-reject-kb-1').click()

    await waitFor(() => {
      expect(screen.queryByTestId('placement-suggestion-kb-1')).toBeNull()
    })
  })

  it('keeps the row listed and re-enables it when the request fails', async () => {
    mockedResolve.mockRejectedValue(new Error('Internal Error'))

    renderPanel()

    const reject = screen.getByTestId('placement-suggestion-reject-kb-1') as HTMLButtonElement
    reject.click()

    await waitFor(() => {
      expect(reject.disabled).toBe(false)
    })

    expect(screen.getByTestId('placement-suggestion-kb-1')).toBeDefined()
  })
})
