import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useEffect, useState } from 'react'
import { AccountLinks } from '../nav/account-links'
import { Sidebar } from '../nav/sidebar'
import { GlobalSearch } from '../search/global-search'
import { combineHeaderSearch } from '../search/header-search'
import { search, searchTopicsAndModules } from '../curriculum/curriculum.api'
import { GlobalCardChatPanel } from '../global-card-chat/global-card-chat-panel'

import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import appCss from '../styles.css?url'

declare global {
  interface Window {
    __APP_HYDRATED__?: boolean
  }
}

const headerSearch = combineHeaderSearch(
  (query) => search({ data: query }),
  (query) => searchTopicsAndModules({ data: query }),
)

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
        title: 'Post Anki',
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
  const onLoginPage = useRouterState({ select: (state) => state.location.pathname === '/login' })

  useEffect(() => {
    window.__APP_HYDRATED__ = true
  }, [])

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {onLoginPage ? (
          children
        ) : (
        <>
        <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900">
          <div className="border-b border-neutral-200 bg-white">
            <div className="flex items-center gap-x-3 px-5 py-3 sm:px-8">
              <Link to="/" className="shrink-0 text-base font-semibold tracking-tight">
                Post Anki
              </Link>
              <GlobalSearch onSearch={headerSearch} />
              <AccountLinks />
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
        <GlobalCardChatPanel />
        </>
        )}
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
