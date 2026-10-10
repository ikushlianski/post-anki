// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { Curriculum, CurriculumStatus, Subject, SubjectCategory } from '../curriculum/model'
import { moveCategory, moveCurriculum, renameCategory } from '../curriculum/curriculum.api'
import { SubjectSection, resolvePendingMove } from './subject-section'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    'data-testid': testId,
  }: {
    to: string
    params: Record<string, string>
    children: ReactNode
    'data-testid': string
  }) => (
    <a
      href={to}
      data-testid={testId}
      data-params={JSON.stringify(params)}
    >
      {children}
    </a>
  ),
  useRouter: () => ({
    invalidate: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../subject/subject.api')
vi.mock('../curriculum/curriculum.api')
vi.mock('../shared/use-hydrated', () => ({
  useHydrated: () => true,
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SUBJECT_ID = 'subj-1'
const SUBJECT: Subject = {
  id: SUBJECT_ID,
  name: 'Architecture Patterns',
  kind: 'architecture-mentor',
  requireSources: true,
  modelTier: null,
  parentId: null,
}

const CURRICULUM: Curriculum = {
  id: 'curr-1',
  name: 'System Design',
  subjectId: SUBJECT_ID,
  status: 'confirmed',
  learningStatus: 'not_started',
  speed: 'normal',
  hinting: true,
  defaultDepth: 'working',
  origin: 'research',
  strictOrder: false,
  preAssessmentCompletedAt: null,
  domainNodeId: null,
  order: 1,
  modelTier: null,
  categoryId: null,
}

const CATEGORY_A: SubjectCategory = {
  id: 'cat-a',
  subjectId: SUBJECT_ID,
  parentId: null,
  name: 'Backend',
}

const CATEGORY_B: SubjectCategory = {
  id: 'cat-b',
  subjectId: SUBJECT_ID,
  parentId: null,
  name: 'Frontend',
}

const CATEGORY_CHILD: SubjectCategory = {
  id: 'cat-child',
  subjectId: SUBJECT_ID,
  parentId: 'cat-a',
  name: 'Nested',
}

function makeRect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    left,
    bottom: top + height,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mockBoundingRects(rectsByTestId: Record<string, DOMRect>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const testId = this.getAttribute('data-testid')

    return testId && rectsByTestId[testId] ? rectsByTestId[testId] : makeRect(0, 0, 0, 0)
  })
}

function dragTo(handle: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  fireEvent.pointerDown(handle, { clientX: from.x, clientY: from.y, button: 0, isPrimary: true, pointerId: 1 })
  fireEvent.pointerMove(document, { clientX: to.x, clientY: to.y, button: 1, isPrimary: true, pointerId: 1 })
  fireEvent.pointerMove(document, { clientX: to.x, clientY: to.y, button: 1, isPrimary: true, pointerId: 1 })
  fireEvent.pointerUp(document, { clientX: to.x, clientY: to.y, button: 0, isPrimary: true, pointerId: 1 })
}

// dnd-kit suppresses click events for 50ms after a drag ends (to stop the
// pointerup from triggering a link), so the confirm click must land after
// that window — matching a real user's click timing.
async function settleAfterDrag() {
  await new Promise((resolve) => setTimeout(resolve, 70))
}

describe('SubjectSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show the unified add-material action for architecture-mentor subjects', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} globalModelTier="cheap" />,
    )

    expect(screen.getByTestId('create-material-toggle')).toBeDefined()
  })

  it('should offer Add knowledge scoped to this subject next to new material', () => {
    render(
      <SubjectSection subject={SUBJECT} curricula={[]} allSubjects={[SUBJECT]} globalModelTier="cheap" />,
    )

    expect(screen.getByTestId('create-material-toggle')).toBeDefined()
    expect(screen.getByTestId('subject-add-knowledge-button').textContent).toBe('Add knowledge')
  })

  it('should display curriculum when provided', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[CURRICULUM]}
        allSubjects={[SUBJECT]}
        globalModelTier="cheap"
      />,
    )

    expect(screen.getByTestId('curriculum-name').textContent).toBe('System Design')
  })

  function renderCurriculumWithStatus(status: CurriculumStatus) {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[{ ...CURRICULUM, status }]}
        allSubjects={[SUBJECT]}
        globalModelTier="cheap"
      />,
    )
  }

  it.each(['awaiting_source_approval', 'failed', 'ready'] as const)(
    'should flag a curriculum needing a decision for %s',
    (status) => {
      renderCurriculumWithStatus(status)

      expect(screen.getByTestId('needs-decision-icon')).toBeDefined()
    },
  )

  it.each(['draft', 'curating', 'shaping_structure', 'confirmed'] as const)(
    'should not flag a curriculum that needs no decision for %s',
    (status) => {
      renderCurriculumWithStatus(status)

      expect(screen.queryByTestId('needs-decision-icon')).toBeNull()
    },
  )
})

describe('resolvePendingMove', () => {
  it('rejects dropping a category onto its own descendant', () => {
    const result = resolvePendingMove(
      { id: 'cat-a', type: 'category' },
      { id: 'cat-child', type: 'category' },
      [CATEGORY_A, CATEGORY_B, CATEGORY_CHILD],
      [],
    )

    expect(result).toBeNull()
  })

  it('maps a category dropped onto another category', () => {
    const result = resolvePendingMove(
      { id: 'cat-a', type: 'category' },
      { id: 'cat-b', type: 'category' },
      [CATEGORY_A, CATEGORY_B],
      [],
    )

    expect(result).toEqual({
      kind: 'category',
      sourceId: 'cat-a',
      sourceName: 'Backend',
      targetId: 'cat-b',
    })
  })

  it('maps a curriculum dropped onto a category keeping its subject', () => {
    const result = resolvePendingMove(
      { id: 'curr-1', type: 'curriculum' },
      { id: 'cat-a', type: 'category' },
      [CATEGORY_A],
      [CURRICULUM],
    )

    expect(result).toEqual({
      kind: 'curriculum',
      curriculumId: 'curr-1',
      curriculumName: 'System Design',
      subjectId: SUBJECT_ID,
      targetId: 'cat-a',
    })
  })
})

describe('category drag and drop', () => {
  it('shows a confirm bar and calls moveCategory only after confirm', async () => {
    mockBoundingRects({
      'category-card-cat-a': makeRect(0, 0, 200, 40),
      'category-card-cat-b': makeRect(100, 0, 200, 40),
    })

    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A, CATEGORY_B]}
        allCategories={[CATEGORY_A, CATEGORY_B]}
        globalModelTier="cheap"
      />,
    )

    dragTo(
      screen.getByTestId('category-drag-handle-cat-a'),
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    )

    expect(screen.getByTestId('category-move-confirm-bar-cat-b')).toBeDefined()
    expect(vi.mocked(moveCategory)).not.toHaveBeenCalled()

    await settleAfterDrag()
    fireEvent.click(screen.getByTestId('category-move-confirm-cat-b'))

    expect(vi.mocked(moveCategory)).toHaveBeenCalledWith({
      data: { categoryId: 'cat-a', parentId: 'cat-b' },
    })
  })
})

describe('category rename', () => {
  it('arms a rename control and calls renameCategory only after confirm', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A]}
        allCategories={[CATEGORY_A]}
        globalModelTier="cheap"
      />,
    )

    fireEvent.click(screen.getByTestId('category-rename-cat-a-button'))

    expect(vi.mocked(renameCategory)).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('category-rename-cat-a-input'), {
      target: { value: 'Server-side' },
    })
    fireEvent.click(screen.getByTestId('category-rename-cat-a-confirm'))

    expect(vi.mocked(renameCategory)).toHaveBeenCalledWith({
      data: { categoryId: 'cat-a', name: 'Server-side' },
    })
  })

  it('surfaces an error and stays open when the rename call fails', async () => {
    vi.mocked(renameCategory).mockRejectedValueOnce(new Error('boom'))

    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A]}
        allCategories={[CATEGORY_A]}
        globalModelTier="cheap"
      />,
    )

    fireEvent.click(screen.getByTestId('category-rename-cat-a-button'))
    fireEvent.change(screen.getByTestId('category-rename-cat-a-input'), {
      target: { value: 'Server-side' },
    })
    fireEvent.click(screen.getByTestId('category-rename-cat-a-confirm'))

    const errorEl = await screen.findByTestId('category-rename-cat-a-error')
    expect(errorEl.textContent).toContain('Rename failed')
    expect(screen.getByTestId('category-rename-cat-a-input')).toBeDefined()
  })

  it('never calls renameCategory for a whitespace-only name', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A]}
        allCategories={[CATEGORY_A]}
        globalModelTier="cheap"
      />,
    )

    fireEvent.click(screen.getByTestId('category-rename-cat-a-button'))
    fireEvent.change(screen.getByTestId('category-rename-cat-a-input'), {
      target: { value: '   ' },
    })

    expect(
      (screen.getByTestId('category-rename-cat-a-confirm') as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})

describe('curriculum drag onto a category', () => {
  it('shows a confirm bar and calls moveCurriculum only after confirm', async () => {
    mockBoundingRects({
      'curriculum-item-curr-1': makeRect(200, 0, 200, 40),
      'category-card-cat-a': makeRect(0, 0, 200, 40),
    })

    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[CURRICULUM]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A]}
        allCategories={[CATEGORY_A]}
        globalModelTier="cheap"
      />,
    )

    dragTo(
      screen.getByTestId('drag-handle-curr-1'),
      { x: 10, y: 220 },
      { x: 10, y: 20 },
    )

    expect(screen.getByTestId('category-move-confirm-bar-cat-a')).toBeDefined()
    expect(vi.mocked(moveCurriculum)).not.toHaveBeenCalled()

    await settleAfterDrag()
    fireEvent.click(screen.getByTestId('category-move-confirm-cat-a'))

    expect(vi.mocked(moveCurriculum)).toHaveBeenCalledWith({
      data: { curriculumId: 'curr-1', targetSubjectId: SUBJECT_ID, categoryId: 'cat-a' },
    })
  })
})

describe('subject page reorder affordances', () => {
  it('should show the reorder hint and touch-safe grips above the curricula', () => {
    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[CURRICULUM]}
        allSubjects={[SUBJECT]}
        categories={[]}
        allCategories={[]}
        globalModelTier="cheap"
      />,
    )

    expect(screen.getByTestId('subject-reorder-hint').textContent).toBe('Drag rows to reorder')
    expect(screen.getByTestId('drag-handle-curr-1').className).toContain('touch-none')
  })

  it('should start a keyboard drag of a category when Space is pressed on its handle', () => {
    mockBoundingRects({
      'category-card-cat-a': makeRect(0, 0, 200, 40),
      'category-card-cat-b': makeRect(0, 100, 200, 40),
    })

    render(
      <SubjectSection
        subject={SUBJECT}
        curricula={[]}
        allSubjects={[SUBJECT]}
        categories={[CATEGORY_A, CATEGORY_B]}
        allCategories={[CATEGORY_A, CATEGORY_B]}
        globalModelTier="cheap"
      />,
    )

    fireEvent.keyDown(screen.getByTestId('category-drag-handle-cat-a'), { code: 'Space', key: ' ' })

    expect(screen.getByText(/Draggable item cat-a was moved over/)).toBeDefined()

    fireEvent.keyDown(screen.getByTestId('category-drag-handle-cat-a'), { code: 'Escape', key: 'Escape' })

    expect(screen.queryByTestId('category-move-confirm-bar-cat-b')).toBeNull()
  })
})
