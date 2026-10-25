// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ZodType } from 'zod'

import { AddKnowledgeForm } from '../knowledge-source/add-knowledge-form'
import {
  createKnowledgeSource,
  createKnowledgeSourceFromUrl,
  createKnowledgeSources,
} from '../knowledge-source/knowledge-source.api'

import { Sidebar } from '../nav/sidebar'
import { Route } from './add-knowledge'

const liveSubjectRows = vi.hoisted(() => ({ rows: [] as unknown[] }))
const searchState = vi.hoisted(() => ({ value: {} as { subjectId?: string } }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: ReactNode
    to?: string
    params?: Record<string, string>
  } & Record<string, unknown>) => {
    const href = Object.entries(params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), to ?? '#')

    return (
      <a href={href} data-to={to} {...rest}>
        {children}
      </a>
    )
  },
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => searchState.value,
  }),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: liveSubjectRows.rows }),
}))

vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: {},
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getPendingKnowledgeBitCountForNav: vi.fn().mockResolvedValue({ count: 3 }),
}))

vi.mock('../knowledge-source/knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
  createKnowledgeSourceFromUrl: vi.fn(),
  checkKnowledgeSourceSubject: vi.fn().mockResolvedValue({ status: 'none' }),
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
    liveSubjectRows.rows = []
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
      data: { text: 'Retry budgets cap cascading failure.' },
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
      data: { texts: ['Block one', 'Block two', 'Block three'] },
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

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: { text: 'Only this one' } })
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

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: { text: 'Still here' } })
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
      data: { url: 'https://example.com/article' },
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

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({ data: { text: 'Some prose' } })
    expect(mockedCreateKnowledgeSourceFromUrl).toHaveBeenCalledWith({
      data: { url: 'https://example.com/article' },
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

  it('shows Saving… and disables submit while the request is in flight', async () => {
    let resolveSave: (() => void) | undefined

    mockedCreateKnowledgeSource.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve(source('ks_1'))
        }),
    )

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-submit-button').textContent).toBe('Saving…')
    })

    expect(screen.getByTestId('knowledge-submit-button')).toHaveProperty('disabled', true)

    resolveSave?.()

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-submit-button').textContent).toBe('Add knowledge')
    })
  })

  it('names the failed block by its position on screen when only some blocks are saved', async () => {
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
      expect(screen.getByTestId('knowledge-error-message').textContent).toBe(
        'Block 1 could not be added. Try again.',
      )
    })
  })

  it('names every failed block when several blocks fail together', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))
    mockedCreateKnowledgeSourceFromUrl.mockRejectedValue(new Error('api POST /knowledge-sources → 400'))

    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-1'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), {
      target: { value: 'https://example.com/broken-one' },
    })

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-2'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-2'), {
      target: { value: 'https://example.com/broken-two' },
    })

    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message').textContent).toBe(
        'Blocks 1, 2 could not be added. Try again.',
      )
    })
  })

  it('marks the selected mode toggle with aria-pressed and moves it when the mode changes', () => {
    render(<AddKnowledgeForm />)

    expect(screen.getByTestId('knowledge-block-type-text-0').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('knowledge-block-type-url-0').getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByTestId('knowledge-block-type-url-0'))

    expect(screen.getByTestId('knowledge-block-type-text-0').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('knowledge-block-type-url-0').getAttribute('aria-pressed')).toBe('true')
  })

  it('gives every text and link input an accessible label that names its block', () => {
    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-block-type-url-1'))

    expect(screen.getByLabelText('Text to learn from, block 1')).toBe(
      screen.getByTestId('knowledge-block-input-0'),
    )
    expect(screen.getByLabelText('Article link, block 2')).toBe(
      screen.getByTestId('knowledge-block-input-1'),
    )
  })

  it('names the block that each Remove button removes', () => {
    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))

    expect(screen.getByRole('button', { name: 'Remove block 2' })).toBe(
      screen.getByTestId('knowledge-remove-block-button-1'),
    )
    expect(screen.getByRole('button', { name: 'Remove block 3' })).toBe(
      screen.getByTestId('knowledge-remove-block-button-2'),
    )
  })
  it('sends the chosen subject with every block when several are submitted', async () => {
    liveSubjectRows.rows = [{ id: 'sub_web', name: 'Web', parentId: null }]
    mockedCreateKnowledgeSources.mockResolvedValue([source('ks_1'), source('ks_2')])

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-subject-select'), { target: { value: 'Web' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Block one' } })
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'Block two' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSources).toHaveBeenCalledWith({
      data: { texts: ['Block one', 'Block two'], subjectId: 'sub_web' },
    })
  })

  it('sends no subject when the picker is left on No subject', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    expect((screen.getByTestId('knowledge-subject-select') as HTMLSelectElement).value).toBe('')
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Loose thought' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    const [payload] = mockedCreateKnowledgeSource.mock.calls[0]

    expect(payload.data.subjectId).toBeUndefined()
  })
})

const salesRows = [
  { id: 'sub_business', name: 'Business', parentId: null },
  { id: 'sub_sales', name: 'Sales', parentId: 'sub_business' },
]

describe('AddKnowledgeForm with a preselected subject', () => {
  afterEach(() => {
    cleanup()
    liveSubjectRows.rows = []
    mockedCreateKnowledgeSource.mockReset()
  })

  it('preselects the subject passed in and names it in the Adding to label', () => {
    liveSubjectRows.rows = salesRows

    render(<AddKnowledgeForm initialSubjectId="sub_sales" />)

    expect((screen.getByTestId('knowledge-subject-select') as HTMLSelectElement).value).toBe('Business › Sales')
    expect(screen.getByTestId('knowledge-adding-to-label').textContent).toBe(
      'Adding to: Business › Sales',
    )
  })

  it('ignores an initialSubjectId that matches no subject and sends no subject', async () => {
    liveSubjectRows.rows = salesRows
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm initialSubjectId="sub_missing" />)

    expect((screen.getByTestId('knowledge-subject-select') as HTMLSelectElement).value).toBe('')
    expect(screen.getByTestId('knowledge-adding-to-label').textContent).toBe('Adding to: No subject')

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Loose thought' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    const [payload] = mockedCreateKnowledgeSource.mock.calls[0]

    expect(payload.data.subjectId).toBeUndefined()
    expect(screen.queryByTestId('knowledge-success-back-link')).toBeNull()
  })

  it('lets the user change the preselected subject before saving', async () => {
    liveSubjectRows.rows = salesRows
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm initialSubjectId="sub_sales" />)

    fireEvent.change(screen.getByTestId('knowledge-subject-select'), { target: { value: 'Business' } })
    expect(screen.getByTestId('knowledge-adding-to-label').textContent).toBe('Adding to: Business')

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
    })

    expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({
      data: { text: 'Some prose', subjectId: 'sub_business' },
    })
  })

  it('links back to the preselected subject after a successful save', async () => {
    liveSubjectRows.rows = salesRows
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm initialSubjectId="sub_sales" />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-back-link').textContent).toBe('Back to Business › Sales')
    })

    expect(screen.getByTestId('knowledge-success-back-link').getAttribute('href')).toBe('/subject/sub_sales')
    expect(screen.getByTestId('knowledge-success-review-link')).toBeDefined()
    expect(screen.getByTestId('knowledge-success-message')).toBeDefined()
  })
})

describe('Route (/add-knowledge) subject search param', () => {
  const searchSchema = (Route as unknown as { validateSearch: ZodType<{ subjectId?: string }> })
    .validateSearch

  afterEach(() => {
    cleanup()
    liveSubjectRows.rows = []
    searchState.value = {}
  })

  it('keeps a well-formed subjectId from the URL', () => {
    expect(searchSchema.parse({ subjectId: 'sub_sales' })).toEqual({ subjectId: 'sub_sales' })
  })

  it('drops a subjectId that is not a string', () => {
    expect(searchSchema.parse({ subjectId: 42 })).toEqual({})
  })

  it('drops an empty subjectId', () => {
    expect(searchSchema.parse({ subjectId: '' })).toEqual({})
  })

  it('preselects the subject named by the subjectId search param', () => {
    liveSubjectRows.rows = salesRows
    searchState.value = { subjectId: 'sub_sales' }

    const AddKnowledgePage = (Route as unknown as { component: () => ReactNode }).component

    render(<AddKnowledgePage />)

    expect((screen.getByTestId('knowledge-subject-select') as HTMLSelectElement).value).toBe('Business › Sales')
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

  it('explains in plain words that pasted text becomes suggestions to approve', () => {
    render(<AddKnowledgePage />)

    expect(
      screen.getByText('Paste text and the app will suggest knowledge items for you to approve.'),
    ).toBeDefined()
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

  it('should show the number of suggestions waiting for approval', async () => {
    render(<Sidebar />)

    await waitFor(() => {
      expect(screen.getByTestId('nav-knowledge-bit-review').textContent).toBe(
        'Knowledge triage (3)',
      )
    })
    expect(screen.getByTestId('nav-knowledge-bit-review').getAttribute('data-to')).toBe(
      '/knowledge-bit-review',
    )
  })
})

describe('AddKnowledgeForm model choice', () => {
  afterEach(cleanup)

  it('sends the chosen model with a pasted text so that model parses this knowledge', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-model-select'), {
      target: { value: 'openrouter/openai/gpt-6-luna' },
    })
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({
        data: { text: 'Some prose', subjectId: undefined, modelId: 'openrouter/openai/gpt-6-luna' },
      })
    })
  })

  it('sends the chosen model with every block when several are submitted', async () => {
    mockedCreateKnowledgeSources.mockResolvedValue([source('ks_1'), source('ks_2')])

    render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-model-select'), {
      target: { value: 'openrouter/openai/gpt-5-mini' },
    })
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Block one' } })
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'Block two' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(mockedCreateKnowledgeSources).toHaveBeenCalledWith({
        data: {
          texts: ['Block one', 'Block two'],
          subjectId: undefined,
          modelId: 'openrouter/openai/gpt-5-mini',
        },
      })
    })
  })

  it('sends no model when the default is left selected so the admin default applies', async () => {
    mockedCreateKnowledgeSource.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)

    expect((screen.getByTestId('knowledge-model-select') as HTMLSelectElement).value).toBe('')

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(mockedCreateKnowledgeSource).toHaveBeenCalledWith({
        data: { text: 'Some prose', subjectId: undefined, modelId: undefined },
      })
    })
  })
})
