import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { useCallback, useEffect, useState } from 'react'
import { AccountLinks } from '../nav/account-links'
import { OfflineBanner } from '../nav/offline-banner'
import { MobileNavDrawer } from '../nav/mobile-nav-drawer'
import { Sidebar } from '../nav/sidebar'
import { installSessionExpiredRedirect } from '../web-auth/session-expired'
import { MAIN_CONTENT_ID, SkipToContent } from '../nav/skip-to-content'
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
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])
  const onLoginPage = useRouterState({ select: (state) => state.location.pathname === '/login' })

  useEffect(() => {
    window.__APP_HYDRATED__ = true

    return installSessionExpiredRedirect(window)
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
        <SkipToContent />
        <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 md:h-screen md:overflow-hidden">
          <OfflineBanner />
          <div className="border-b border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-1 sm:flex-nowrap sm:px-8 sm:py-3">
              <Link to="/" className="inline-flex min-h-[44px] shrink-0 items-center text-base font-semibold tracking-tight sm:min-h-0">
                Post Anki
              </Link>
              <GlobalSearch onSearch={headerSearch} />
              <AccountLinks />
              <button
                type="button"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center md:hidden"
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

          <div className="flex flex-1 md:min-h-0">
            <aside className="hidden md:flex md:w-56 md:flex-col md:overflow-hidden border-r border-neutral-200 bg-white">
              <Sidebar />
            </aside>

            <div id={MAIN_CONTENT_ID} tabIndex={-1} className="min-w-0 flex-1 outline-none md:overflow-y-auto">
              {children}
            </div>
          </div>

          <MobileNavDrawer open={mobileNavOpen} onClose={closeMobileNav} />
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
