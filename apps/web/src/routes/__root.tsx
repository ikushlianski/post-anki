import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'post·anki',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="min-h-full bg-neutral-50 text-neutral-900">
          <nav className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 sm:px-8">
              <Link to="/" className="text-base font-semibold tracking-tight">
                post·anki
              </Link>
              <Link
                to="/"
                className="text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900"
                activeOptions={{ exact: true }}
              >
                Curricula
              </Link>
              <Link
                to="/dashboard"
                className="text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900"
              >
                Dashboard
              </Link>
              <Link
                to="/today"
                search={{ mode: 'socratic' }}
                className="text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900"
              >
                Today
              </Link>
              <Link
                to="/concerns"
                className="text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900"
              >
                Concerns
              </Link>
              <Link
                to="/decide"
                className="text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900"
              >
                Decide
              </Link>
            </div>
          </nav>
          {children}
        </div>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
