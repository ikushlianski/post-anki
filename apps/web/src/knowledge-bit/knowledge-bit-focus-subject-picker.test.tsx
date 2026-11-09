import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const move = vi.fn()
const create = vi.fn()

vi.mock('./knowledge-bit-subject-move.api', () => ({
  moveKnowledgeBitToSubjectForReview: (args: unknown) => move(args),
}))
vi.mock('../subject/subject.api', () => ({ createSubject: (args: unknown) => create(args) }))
vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({
    options: [
      { id: 'sub_a', label: 'Physics' },
      { id: 'sub_b', label: 'Physics › Optics' },
    ],
    labelFor: (id: string | null) => (id === 'sub_a' ? 'Physics' : id === 'sub_b' ? 'Physics › Optics' : ''),
  }),
}))

const { KnowledgeBitFocusSubjectPicker } = await import('./knowledge-bit-focus-subject-picker')

function setup() {
  const onChanged = vi.fn()

  render(<KnowledgeBitFocusSubjectPicker bitId="kb_1" subjectName="Math" onChanged={onChanged} />)

  return onChanged
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('KnowledgeBitFocusSubjectPicker', () => {
  it('should assign the item to a chosen subsubject and show the new subject', async () => {
    move.mockResolvedValue({ moved: ['kb_1'], skipped: [] })
    const onChanged = setup()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-subject-change'))
    fireEvent.click(screen.getByRole('combobox', { name: 'Subject' }))
    fireEvent.mouseDown(await screen.findByTestId('knowledge-bit-focus-subject-select-option-sub_b'))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Physics › Optics'))
    expect(move).toHaveBeenCalledWith({ data: { bitId: 'kb_1', subjectId: 'sub_b' } })
  })

  it('should create a subsubject under a parent and assign the item to it', async () => {
    create.mockResolvedValue({ id: 'sub_new' })
    move.mockResolvedValue({ moved: ['kb_1'], skipped: [] })
    const onChanged = setup()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-subject-change'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-subject-new'))
    fireEvent.change(screen.getByTestId('knowledge-bit-focus-subject-new-name'), { target: { value: 'Lenses' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent subject' }))
    fireEvent.mouseDown(await screen.findByTestId('knowledge-bit-focus-subject-parent-option-sub_a'))
    fireEvent.click(screen.getByTestId('knowledge-bit-focus-subject-create'))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith('Physics › Lenses'))
    expect(create).toHaveBeenCalledWith({ data: { name: 'Lenses', kind: 'architecture-mentor', parentId: 'sub_a' } })
    expect(move).toHaveBeenCalledWith({ data: { bitId: 'kb_1', subjectId: 'sub_new' } })
  })

  it('should keep the old subject and show an error when the move is skipped', async () => {
    move.mockResolvedValue({ moved: [], skipped: [{ id: 'kb_1', reason: 'curriculum_placed' }] })
    const onChanged = setup()

    fireEvent.click(screen.getByTestId('knowledge-bit-focus-subject-change'))
    fireEvent.click(screen.getByRole('combobox', { name: 'Subject' }))
    fireEvent.mouseDown(await screen.findByTestId('knowledge-bit-focus-subject-select-option-sub_a'))

    expect(await screen.findByTestId('knowledge-bit-focus-subject-error')).toBeTruthy()
    expect(onChanged).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-bit-focus-subject').textContent).toBe('Math')
  })
})
