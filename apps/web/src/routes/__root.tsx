import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useState } from 'react'
import { Sidebar } from '../nav/sidebar'

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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
          <div className="border-b border-neutral-200 bg-white">
            <div className="flex items-center gap-x-3 px-5 py-3 sm:px-8">
              <Link to="/" className="text-base font-semibold tracking-tight">
                post·anki
              </Link>
              <button
                type="button"
                className="md:hidden"
                data-testid="mobile-nav-toggle"
                aria-label="Open navigation"
                onClick={() => setMobileNavOpen(true)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-6"
                  aria-hidden="true"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex flex-1">
            <aside className="hidden md:flex md:w-56 md:flex-col border-r border-neutral-200 bg-white">
              <Sidebar />
            </aside>

            <div className="min-w-0 flex-1">{children}</div>
          </div>

          {mobileNavOpen ? (
            <>
              <div
                className="fixed inset-0 z-30 bg-black/30 md:hidden"
                onClick={() => setMobileNavOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 z-40 w-64 bg-white shadow-lg md:hidden">
                <Sidebar />
              </div>
            </>
          ) : null}
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
