// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useLoaderData: () => ({ result: { ok: true, data: [] } }),
    component: config.component,
  }),
  Link: ({ children, to, hash }: { children: ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

vi.mock('../notion-source/notion-source.api')
vi.mock('../notion-source/notion-sources-panel', () => ({ NotionSourcesPanel: () => null }))

import { Route } from './notion-sources'

const Page = (Route as unknown as { component: () => ReactNode }).component

afterEach(cleanup)

describe('NotionSourcesPage', () => {
  it('should link from the token hint straight to the Notion connection setting', () => {
    render(<Page />)

    expect(screen.getByRole('link', { name: 'Admin settings' }).getAttribute('href')).toBe(
      '/admin-settings#notion-connection',
    )
  })
})
