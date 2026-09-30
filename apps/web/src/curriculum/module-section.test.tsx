// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Module } from './model'
import { ModuleSection } from './module-section'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./curriculum.api', () => ({
  addModuleComment: vi.fn(),
  createTopic: vi.fn(),
  deleteModule: vi.fn(),
  reorderModules: vi.fn(),
  updateModule: vi.fn(),
}))

vi.mock('../shared/use-hydrated', () => ({
  useHydrated: () => true,
}))

function module(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod_1',
    curriculumId: 'cur_1',
    title: 'Connection management',
    order: 0,
    priority: 0,
    learningStatus: 'probing',
    level: null,
    topics: [],
    progress: { topicsIncluded: 4, topicsMastered: 1, percent: 25 },
    dueCount: 3,
    ...overrides,
  }
}

function renderModuleSection(overrides: Partial<Module> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <ModuleSection
        module={module(overrides)}
        recommendedTopicId={null}
        canProbe={false}
        editable={false}
        curriculumId="cur_1"
        moduleOrder={['mod_1']}
        allModules={[{ id: 'mod_1', title: 'Connection management' }]}
        strictOrder={false}
      />
    </QueryClientProvider>,
  )
}

describe('ModuleSection', () => {
  afterEach(cleanup)

  it('shows the module-level due count next to its progress', () => {
    renderModuleSection({ dueCount: 3 })

    expect(screen.getByText(/·\s*3 due/)).toBeDefined()
  })

  it('shows zero due bits as caught up rather than omitting the count', () => {
    renderModuleSection({ dueCount: 0 })

    expect(screen.getByText(/·\s*0 due/)).toBeDefined()
  })
})
