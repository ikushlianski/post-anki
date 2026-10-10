import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { expect, fn, userEvent, within } from 'storybook/test'

import { DashboardView } from '../../dashboard/dashboard-view'
import {
  dashboardCurricula,
  dashboardDueTopics,
  dashboardStreak,
  dashboardSubjects,
} from '../../mocks/dashboard.mock'

const LINK_TARGET_PATHS = [
  '/subject/$subjectId',
  '/curriculum/$curriculumId',
  '/study-sessions/$sessionId',
  '/knowledge/answer',
  '/subjects/new',
]

function createStoryRouter(Story: () => ReactNode) {
  const rootRoute = createRootRoute({ component: Outlet })
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Story })
  const linkTargetRoutes = LINK_TARGET_PATHS.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
  )

  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, ...linkTargetRoutes]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function DashboardStoryProviders({ Story }: { Story: () => ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [router] = useState(() => createStoryRouter(Story))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

const meta: Meta<typeof DashboardView> = {
  title: 'Dashboard/Home',
  component: DashboardView,
  tags: ['autodocs'],
  args: {
    subjects: dashboardSubjects,
    curricula: dashboardCurricula,
    courseRefocusSuggestions: { ok: true, data: [] },
    sessions: { ok: true, data: [] },
    learningPaths: { ok: true, data: [] },
    streak: { ok: true, data: dashboardStreak },
    dueTopics: { ok: true, data: dashboardDueTopics },
    onRenameSubject: fn(async () => true),
    onDeleteSubject: fn(async () => true),
  },
  decorators: [(Story) => <DashboardStoryProviders Story={Story} />],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The dashboard at /. Shows the resume card, the most pressing topics, the streak, and every subject with its curricula count. Each subject card has a ⋯ menu in its top-right corner for opening, renaming or deleting the subject.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof DashboardView>

export const SeveralSubjects: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Three subjects: Business and Software architecture with curricula, and English with none. One curriculum awaits source approval, so the approval banner is shown above the subject list.',
      },
    },
  },
}

export const EmptyDashboard: Story = {
  args: {
    subjects: [],
    curricula: [],
    dueTopics: { ok: true, data: [] },
    streak: { ok: true, data: { currentStreak: 0, longestStreak: 0, lastActiveDate: null } },
  },
  parameters: {
    docs: {
      description: {
        story:
          'A new account with no subjects. The subject list is replaced by the create-your-first-subject prompt.',
      },
    },
  },
}

export const SubjectMenuOpen: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The ⋯ button on the Business card is open, showing Open, Rename and Delete subject in a menu anchored to the card corner.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = await canvas.findByRole('button', { name: 'Actions for Business' })

    await userEvent.click(trigger)

    await expect(canvas.getByRole('menu', { name: 'Actions for Business' })).toBeVisible()
  },
}

export const PhoneWidth: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        story:
          'The dashboard at phone width. Each subject card keeps its ⋯ button in the top-right corner, and the subject name stays tappable beside it.',
      },
    },
  },
}
