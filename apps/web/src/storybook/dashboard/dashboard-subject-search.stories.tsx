import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'

import type { Subject } from '../../curriculum/model'
import { DashboardSubjectSearch } from '../../dashboard/dashboard-subject-search'

const SUBJECTS: Subject[] = [
  { id: 'subject-programming', name: 'Programming / Web Development', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: null },
  { id: 'subject-databases', name: 'Databases', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: 'subject-programming' },
  { id: 'subject-business', name: 'Business', kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId: null },
]

// Module-level so the component's search effect sees a stable function across renders.
async function searchStub(query: string): Promise<Subject[]> {
  return SUBJECTS.filter((subject) => subject.name.toLowerCase().includes(query.toLowerCase()))
}

async function failingSearch(): Promise<Subject[]> {
  throw new Error('offline')
}

const meta: Meta<typeof DashboardSubjectSearch> = {
  title: 'Dashboard/Subject search',
  component: DashboardSubjectSearch,
  tags: ['autodocs'],
  args: {
    subjects: SUBJECTS,
    search: searchStub,
    onSearchingChange: fn(),
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Search over the subjects. Each match shows its parent path, for example "Programming / Web Development › Databases". Escape clears the query and brings the subject list back.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof DashboardSubjectSearch>

export const ResultsWithParentPath: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search subjects' }), 'data')

    await expect(await canvas.findByRole('link', { name: 'Programming / Web Development › Databases' })).toBeVisible()
  },
}

export const NoMatches: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search subjects' }), 'zzz')

    await expect(await canvas.findByTestId('subject-search-empty')).toHaveTextContent('No subjects match "zzz".')
  },
}

export const ResultCountAndClear: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search subjects' }), 'data')

    await expect(await canvas.findByTestId('subject-search-count')).toHaveTextContent('1 result')
    await expect(canvas.getByRole('button', { name: 'Clear search' })).toBeVisible()
  },
}

export const FailedWithRetry: Story = {
  args: {
    search: failingSearch,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByRole('searchbox', { name: 'Search subjects' }), 'data')

    await expect(await canvas.findByRole('button', { name: 'Retry' })).toBeVisible()
  },
}
