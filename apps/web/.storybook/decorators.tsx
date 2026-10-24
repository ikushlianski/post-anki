import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Decorator } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

function StoryProviders({ renderStory }: { renderStory: () => ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [router] = useState(() => {
    const rootRoute = createRootRoute({ component: Outlet })
    const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: renderStory })

    return createRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  })

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

export const withAppProviders: Decorator = (Story) => <StoryProviders renderStory={() => <Story />} />
