// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'
import { createKnowledgeSource, createKnowledgeSources } from '../knowledge-source/knowledge-source.api'
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

vi.mock('../knowledge-source/knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
}))

const mockedCreateKnowledgeSource = vi.mocked(createKnowledgeSource)
const mockedCreateKnowledgeSources = vi.mocked(createKnowledgeSources)

function source(id: string) {
  return { id, kind: 'prose', rawText: null, status: 'pending', createdAt: new Date().toISOString() }
}

describe('AddKnowledgeForm', () => {
  afterEach(() => {
    cleanup()
    mockedCreateKnowledgeSource.mockReset()
    mockedCreateKnowledgeSources.mockReset()
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
})
