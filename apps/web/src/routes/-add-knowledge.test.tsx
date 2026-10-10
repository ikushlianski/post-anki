// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'
import {
  createKnowledgeSource,
  createKnowledgeSourceFromUrl,
  createKnowledgeSources,
} from '../knowledge-source/knowledge-source.api'
import { Sidebar } from '../nav/sidebar'
import { Route } from './add-knowledge'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href="#" data-to={to} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => (options: Record<string, unknown>) => options,
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [] }),
}))

vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: {},
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getPendingKnowledgeBitCountForNav: vi.fn().mockResolvedValue({ count: 3 }),
}))

vi.mock('../knowledge-source/knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
  createKnowledgeSourceFromUrl: vi.fn(),
}))

const mockedCreateKnowledgeSource = vi.mocked(createKnowledgeSource)
const mockedCreateKnowledgeSources = vi.mocked(createKnowledgeSources)
const mockedCreateKnowledgeSourceFromUrl = vi.mocked(createKnowledgeSourceFromUrl)

function source(id: string) {
  return { id, kind: 'prose', rawText: null, status: 'pending', createdAt: new Date().toISOString() }
}

describe('AddKnowledgeForm', () => {
  afterEach(() => {
    cleanup()
    mockedCreateKnowledgeSource.mockReset()
    mockedCreateKnowledgeSources.mockReset()
    mockedCreateKnowledgeSourceFromUrl.mockReset()
  })

  it('submits a single block via { text } and clears the form on success', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), {
      target: { value: 'Retry budgets cap cascading failure.' },
    })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({
      data: 'Retry budgets cap cascading failure.',
    })
    expect(mockedCreateKnowledgeSources).not.toHaveBeenCalled()
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLTextAreaElement).value).toBe('')
  })

  it('submits every filled block via { texts } when there are several', async () => {
    mockedCreateKnowledgeSources.mockResolvedValue([source('ks_1'), source('ks_2'), source('ks_3')])

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Block one' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'Block two' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-2'), { target: { value: 'Block three' } })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).toContain('3')
    })

    expect(mockedCreateKnowledgeSources).toHaveBeenCalledWith({
      data: ['Block one', 'Block two', 'Block three'],
    })
    expect(mockedCreateKnowledgeSource).not.toHaveBeenCalled()
  })

  it('drops a blank extra block and still submits as a single { text } call', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Only this one' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: '   ' } })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: 'Only this one' })
    expect(mockedCreateKnowledgeSources).not.toHaveBeenCalled()
  })

  it('disables submit and makes no call when every block is empty', () => {
    render(<AddKnowledgeForm />)

    expect(screen.getByTestId('knowledge-submit-button')).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    expect(mockedCreateKnowledgeSource).not.toHaveBeenCalled()
    expect(mockedCreateKnowledgeSources).not.toHaveBeenCalled()
  })

  it('returns to a single-block submit after an added block is removed', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'Will be removed' } })
    fireEvent.click(screen.getByTestId('knowledge-remove-block-button-1'))

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Still here' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: 'Still here' })
    expect(mockedCreateKnowledgeSources).not.toHaveBeenCalled()
    expect(screen.queryByTestId('knowledge-block-input-1')).toBeNull()
  })

  it('shows an inline error and keeps the form filled in when the server call fails', async () => {
    mockedCreateKnowledgeSource.mockRejectedValue(new Error('api POST /knowledge-sources → 400'))

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Will fail' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message')).toBeDefined()
    })

    expect(screen.queryByTestId('knowledge-success-message')).toBeNull()
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLTextAreaElement).value).toBe('Will fail')
  })

  it('clears a prior confirmation once a later submit fails', async () => {
    mockedCreateKnowledgeSource.mockResolvedValueOnce(source('ks_1'))

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'First one' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    mockedCreateKnowledgeSource.mockRejectedValueOnce(new Error('api POST /knowledge-sources → 400'))

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Second one' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message')).toBeDefined()
    })

    expect(screen.queryByTestId('knowledge-success-message')).toBeNull()
  })

  it('submits a url-only block via createKnowledgeSourceFromUrl, not the text endpoint', async () => {
    mockedCreateKnowledgeSourceFromUrl.mockResolvedValue(source('ks_url'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-0'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), {
      target: { value: 'https://example.com/article' },
    })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSourceFromUrl).toHaveBeenCalledWith({
      data: 'https://example.com/article',
    })
    expect(mockedCreateKnowledgeSource).not.toHaveBeenCalled()
    expect(mockedCreateKnowledgeSources).not.toHaveBeenCalled()
  })

  it('reports a combined count when a text block and a url block are submitted together', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))
    mockedCreateKnowledgeSourceFromUrl.mockResolvedValue(source('ks_url'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-1'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), {
      target: { value: 'https://example.com/article' },
    })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).toBe(
        '2 knowledge sources added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.',
      )
    })

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: 'Some prose' })
    expect(mockedCreateKnowledgeSourceFromUrl).toHaveBeenCalledWith({
      data: 'https://example.com/article',
    })
  })

  it('surfaces the existing error message and keeps the url filled in when a url submission fails', async () => {
    mockedCreateKnowledgeSourceFromUrl.mockRejectedValue(new Error('api POST /knowledge-sources → 400'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-0'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), {
      target: { value: 'https://example.com/broken' },
    })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message')).toBeDefined()
    })

    expect(screen.queryByTestId('knowledge-success-message')).toBeNull()
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLInputElement).value).toBe(
      'https://example.com/broken',
    )
  })

  it('reports a partial success and keeps only the failed url block when text succeeds and the url fails', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))
    mockedCreateKnowledgeSourceFromUrl.mockRejectedValue(new Error('api POST /knowledge-sources → 400'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-1'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), {
      target: { value: 'https://example.com/broken' },
    })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message')).toBeDefined()
    })

    expect(screen.getByTestId('knowledge-success-message').textContent).toBe('Added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.')
    expect(screen.queryByTestId('knowledge-block-input-1')).toBeNull()
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLInputElement).value).toBe(
      'https://example.com/broken',
    )
  })

  it('disables block edits while a submit is in flight, so indices cannot shift mid-request', async () => {
    let resolveUrlCall: (() => void) | undefined

    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))
    mockedCreateKnowledgeSourceFromUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUrlCall = () => resolve(source('ks_url'))
        }),
    )

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-1'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), {
      target: { value: 'https://example.com/slow' },
    })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-remove-block-button-1')).toHaveProperty('disabled', true)
    })

    expect(screen.getByTestId('knowledge-block-input-0')).toHaveProperty('disabled', true)
    expect(screen.getByTestId('knowledge-block-input-1')).toHaveProperty('disabled', true)
    expect(screen.getByTestId('knowledge-add-block-button')).toHaveProperty('disabled', true)

    resolveUrlCall?.()

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).toBe(
        '2 knowledge sources added. Questions take a minute or two to appear. Approve them on the next screen to add them to your review queue.',
      )
    })
  })
})

describe('Route (/add-knowledge)', () => {
  const AddKnowledgePage = (Route as unknown as { component: () => ReactNode }).component

  afterEach(() => {
    cleanup()
  })

  it('mounts the add-knowledge form on the route page', () => {
    render(<AddKnowledgePage />)

    expect(screen.getByTestId('knowledge-add-form')).toBeDefined()
  })
})

describe('add-knowledge success link', () => {
  afterEach(() => {
    cleanup()
    mockedCreateKnowledgeSource.mockReset()
  })

  it('should point to the approval page once a source is added', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))
    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some text' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-review-link').getAttribute('data-to')).toBe(
        '/knowledge-bit-review',
      )
    })
  })
})

describe('Sidebar', () => {
  afterEach(() => {
    cleanup()
  })

  it('has an Add knowledge link that navigates to the new route', () => {
    render(<Sidebar />)

    const link = screen.getByTestId('nav-add-knowledge')

    expect(link.getAttribute('data-to')).toBe('/add-knowledge')
    expect(link.textContent).toContain('Add knowledge')
  })

  it('should show the number of suggestions waiting for approval', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe(
        'Approve suggestions (3)',
      )
    })
    expect(screen.getByTestId('nav-knowledge-bit-review').getAttribute('data-to')).toBe(
      '/knowledge-bit-review',
    )
  })
})
