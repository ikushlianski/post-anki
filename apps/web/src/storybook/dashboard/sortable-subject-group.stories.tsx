import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'

import type { Subject } from '../../curriculum/model'
import { SortableSubjectGroup } from '../../dashboard/sortable-subject-group'

const SIBLINGS: Subject[] = [
  { id: 'subject-sales', name: 'Sales', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: 'subject-business' },
  { id: 'subject-hr', name: 'HR', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: 'subject-business' },
  { id: 'subject-smm', name: 'SMM', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: 'subject-business' },
]

const meta: Meta<typeof SortableSubjectGroup> = {
  title: 'Dashboard/Sortable subject group',
  component: SortableSubjectGroup,
  tags: ['autodocs'],
  args: {
    parentId: 'subject-business',
    siblings: SIBLINGS,
    renderRow: (subject, handle) => (
      <li ref={handle.rowRef} style={handle.rowStyle} data-testid={`row-${subject.id}`} className="rounded-lg border border-neutral-200 bg-white">
        <button
          type="button"
          aria-label={`Drag ${subject.name}`}
          data-testid={`handle-${subject.id}`}
          className="touch-none px-4 py-3"
          {...handle.attributes}
          {...handle.listeners}
        >
          {subject.name}
        </button>
      </li>
    ),
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One sibling list. Drag a row with the pointer, or focus its handle and use Space, the arrow keys and Space again to reorder. The new order is saved when the drop lands.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof SortableSubjectGroup>

export const DragInProgress: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const handle = canvas.getByTestId('handle-subject-sales')

    handle.focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowDown}')

    await expect(canvas.getByTestId('row-subject-sales')).toBeVisible()
  },
}
