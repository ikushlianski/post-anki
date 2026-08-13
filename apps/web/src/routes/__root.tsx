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

const navLinkClass =
  'text-sm text-neutral-500 hover:text-neutral-900 [&.active]:text-neutral-900'

function NavGroup({
  label,
  testId,
  children,
}: {
  label: string
  testId: string
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline gap-x-3" data-testid={testId}>
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-neutral-400">
        {label}
      </span>
      {children}
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="min-h-full bg-neutral-50 text-neutral-900">
          <nav className="border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 sm:px-8">
              <Link to="/" className="text-base font-semibold tracking-tight">
                post·anki
              </Link>
              <NavGroup label="Study" testId="nav-group-study">
                <Link
                  to="/today"
                  search={{ mode: 'socratic' }}
                  className={navLinkClass}
                >
                  Today
                </Link>
                <Link to="/" className={navLinkClass} activeOptions={{ exact: true }}>
                  Curricula
                </Link>
                <Link to="/dashboard" className={navLinkClass}>
                  Dashboard
                </Link>
                <Link to="/study-sessions" className={navLinkClass}>
                  Sessions
                </Link>
              </NavGroup>
              <NavGroup label="Plan" testId="nav-group-plan">
                <Link to="/learning-list" className={navLinkClass}>
                  Learning list
                </Link>
                <Link to="/learning-paths" className={navLinkClass}>
                  Paths
                </Link>
              </NavGroup>
              <NavGroup label="Review" testId="nav-group-review">
                <Link to="/notes" className={navLinkClass}>
                  Notes
                </Link>
                <Link to="/open-questions" className={navLinkClass}>
                  Open questions
                </Link>
                <Link to="/analytics" className={navLinkClass}>
                  Analytics
                </Link>
                <Link to="/milestones" className={navLinkClass}>
                  Milestones
                </Link>
              </NavGroup>
              <NavGroup label="Reference" testId="nav-group-reference">
                <Link to="/content-library" className={navLinkClass}>
                  Library
                </Link>
                <Link to="/concerns" className={navLinkClass}>
                  Concerns
                </Link>
                <Link to="/decide" className={navLinkClass}>
                  Decide
                </Link>
                <Link to="/admin-settings" className={navLinkClass}>
                  Admin
                </Link>
              </NavGroup>
            </div>
          </nav>
          {children}
        </div>
        {import.meta.env.DEV ? (
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
        ) : null}
        <Scripts />
      </body>
    </html>
  )
}
