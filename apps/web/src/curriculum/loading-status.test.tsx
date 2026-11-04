// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { CardPanel } from './card-panel'
import { LecturePanel } from './lecture-panel'
import { TagNodeBrowser } from './tag-node-browser'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => {
  const pending = () => new Promise(() => {})

  return {
    getCards: pending,
    getLecture: pending,
    listTagNodes: pending,
    generateCards: pending,
    generateLecture: pending,
    listLectureSources: pending,
  }
})

function wrap(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>)
}

afterEach(cleanup)

describe('curriculum loading messages', () => {
  it('should announce the cards loading message as status', () => {
    wrap(<CardPanel topicId="t1" />)

    expect(screen.getByTestId('cards-loading').getAttribute('role')).toBe('status')
  })

  it('should announce the lecture loading message as status', () => {
    wrap(<LecturePanel topicId="t1" />)

    expect(screen.getByTestId('lecture-loading').getAttribute('role')).toBe('status')
  })

  it('should announce the tag browse loading message as status', () => {
    wrap(<TagNodeBrowser tagId="g1" />)

    expect(screen.getByTestId('tag-browse-loading').getAttribute('role')).toBe('status')
  })
})
