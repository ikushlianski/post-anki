// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { Topic } from './model'
import { TopicShapeBar } from './topic-shape-bar'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('./curriculum.api', () => ({
  deleteTopic: vi.fn(),
  reorderTopics: vi.fn(),
  setTopicState: vi.fn(),
}))

afterEach(cleanup)

describe('TopicShapeBar', () => {
  it('should say a topic delete also removes its cards', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <TopicShapeBar
          topic={{ id: 't1', priority: 0 } as Topic}
          topicOrder={['t1']}
          moduleId="m1"
          curriculumId="c1"
          allModules={[{ id: 'm1', title: 'M' }]}
          hydrated
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Deletes this topic and its cards')).toBeTruthy()
  })
})
