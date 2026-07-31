// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DragEndEvent } from '@dnd-kit/core'

import type { Curriculum, Subject } from '../curriculum/model'
import { SubjectSection } from './subject-section'
import { reorderCurricula } from '../curriculum/curriculum.api'

// course-priority-drag-reorder (issue #69) — proves the onDragEnd wiring in
// CourseList (subject-section.tsx): a drag-end fires reorderCurricula with
// the correctly reordered id list (Scenario 1), local render order updates
// synchronously rather than only after the mutation resolves (spec.md's
// grill-plan-reversed decision on optimistic local state), a rejected
// mutation reverts local order and surfaces a visible error while
// re-invalidating (Scenario 5b), and a `language-practice` subject renders
// no drag handle at all (Scenario 7).
//
// dnd-kit's real DndContext/SortableContext/useSortable rely on real DOM
// geometry (getBoundingClientRect) that jsdom always reports as zero, so a
// simulated pointer/keyboard drag through the real library can't reliably
// exercise a specific reorder here. Per spec.md's Frontend DoD wording ("a
// simulated drag-end event") and the separately-documented manual-only real
// mouse-drag check, this test mocks dnd-kit at the module boundary and
// invokes the real onDragEnd handler CourseList passes to DndContext
// directly — the actual reorderAfterDrag + reorderCurricula + revert-on-
// error wiring runs for real; only the drag *gesture* itself is stubbed out.

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode
    onDragEnd: (event: DragEndEvent) => void
  }) => {
    capturedOnDragEnd = onDragEnd

    return children
  },
  PointerSensor: class {},
  KeyboardSensor: class {},
  closestCenter: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: ReactNode }) => children,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'vertical',
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => undefined } },
}))

const mockInvalidate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: ReactNode
    to?: string
    [key: string]: unknown
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ invalidate: mockInvalidate }),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  deleteCurriculum: vi.fn(),
  mergeCurricula: vi.fn(),
  reorderCurricula: vi.fn(),
  createCurriculum: vi.fn(),
}))

vi.mock('./subject.api', () => ({
  deleteSubject: vi.fn(),
  mergeSubjects: vi.fn(),
}))

const mockedReorderCurricula = vi.mocked(reorderCurricula)

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: 'subj-1',
    name: 'Web Dev',
    description: undefined,
    requireSources: false,
    kind: 'architecture-mentor',
    ...overrides,
  }
}

function makeCurriculum(overrides: Partial<Curriculum> = {}): Curriculum {
  return {
    id: 'cur-1',
    subjectId: 'subj-1',
    name: 'Course',
    description: undefined,
    status: 'confirmed',
    learningStatus: 'not_started',
    speed: 'normal',
    hinting: true,
    defaultDepth: 'working',
    origin: 'sources',
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
    order: 1,
    ...overrides,
  }
}

function renderNames(): string[] {
  return screen.getAllByTestId('curriculum-name').map((el) => el.textContent)
}

describe('SubjectSection — course drag-and-drop reorder', () => {
  beforeEach(() => {
    capturedOnDragEnd = undefined
    mockedReorderCurricula.mockReset()
    mockInvalidate.mockReset()
    mockInvalidate.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('reorders locally and calls reorderCurricula with the new order (Scenario 1)', async () => {
    mockedReorderCurricula.mockResolvedValue(null)

    const curricula = [
      makeCurriculum({ id: 'cur-a', name: 'Course A', order: 1 }),
      makeCurriculum({ id: 'cur-b', name: 'Course B', order: 2 }),
      makeCurriculum({ id: 'cur-c', name: 'Course C', order: 3 }),
    ]

    render(
      <SubjectSection
        subject={makeSubject()}
        curricula={curricula}
        allSubjects={[makeSubject()]}
      />,
    )

    expect(capturedOnDragEnd).toBeDefined()

    await act(async () => {
      capturedOnDragEnd!({
        active: { id: 'cur-a' },
        over: { id: 'cur-c' },
      } as DragEndEvent)
    })

    await waitFor(() => expect(mockedReorderCurricula).toHaveBeenCalledTimes(1))

    expect(mockedReorderCurricula).toHaveBeenCalledWith({
      data: { subjectId: 'subj-1', orderedIds: ['cur-b', 'cur-c', 'cur-a'] },
    })

    expect(renderNames()).toEqual(['Course B', 'Course C', 'Course A'])

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1))
  })

  it('updates the render order synchronously, before the mutation resolves', async () => {
    let resolveMutation: (() => void) | undefined
    mockedReorderCurricula.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMutation = () => resolve(null)
        }),
    )

    const curricula = [
      makeCurriculum({ id: 'cur-a', name: 'Course A', order: 1 }),
      makeCurriculum({ id: 'cur-b', name: 'Course B', order: 2 }),
    ]

    render(
      <SubjectSection
        subject={makeSubject()}
        curricula={curricula}
        allSubjects={[makeSubject()]}
      />,
    )

    act(() => {
      capturedOnDragEnd!({
        active: { id: 'cur-a' },
        over: { id: 'cur-b' },
      } as DragEndEvent)
    })

    // The mutation has been called but its promise is still pending — the
    // render order must already reflect the drop, not the pre-drag order.
    expect(mockedReorderCurricula).toHaveBeenCalledTimes(1)
    expect(renderNames()).toEqual(['Course B', 'Course A'])
    expect(mockInvalidate).not.toHaveBeenCalled()

    await act(async () => {
      resolveMutation!()
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInvalidate).toHaveBeenCalledTimes(1))
  })

  it('reverts local order and shows a visible error on a rejected mutation (Scenario 5b)', async () => {
    mockedReorderCurricula.mockRejectedValue(new Error('stale id set'))

    const curricula = [
      makeCurriculum({ id: 'cur-a', name: 'Course A', order: 1 }),
      makeCurriculum({ id: 'cur-b', name: 'Course B', order: 2 }),
    ]

    render(
      <SubjectSection
        subject={makeSubject()}
        curricula={curricula}
        allSubjects={[makeSubject()]}
      />,
    )

    await act(async () => {
      capturedOnDragEnd!({
        active: { id: 'cur-a' },
        over: { id: 'cur-b' },
      } as DragEndEvent)
    })

    await waitFor(() =>
      expect(screen.getByTestId('reorder-error')).toBeDefined(),
    )

    // Reverted to the pre-drag order, not left showing the optimistic
    // (never-persisted) drop order.
    expect(renderNames()).toEqual(['Course A', 'Course B'])

    // Re-invalidates so the learner's next drag starts from the current,
    // correct list rather than the stale one that caused the rejection.
    expect(mockInvalidate).toHaveBeenCalledTimes(1)
  })

  it('renders no drag handle for a language-practice subject (Scenario 7)', () => {
    render(
      <SubjectSection
        subject={makeSubject({ kind: 'language-practice' })}
        curricula={[]}
        allSubjects={[makeSubject({ kind: 'language-practice' })]}
      />,
    )

    expect(screen.getByTestId('open-practice-link')).toBeDefined()
    expect(screen.queryByTestId(/curriculum-drag-handle-/)).toBeNull()
    expect(capturedOnDragEnd).toBeUndefined()
  })

  it('renders no drag handle and the empty-state message for zero courses (Scenario 3)', () => {
    render(
      <SubjectSection
        subject={makeSubject()}
        curricula={[]}
        allSubjects={[makeSubject()]}
      />,
    )

    expect(screen.getByText('No curricula yet.')).toBeDefined()
    expect(capturedOnDragEnd).toBeUndefined()
  })
})
