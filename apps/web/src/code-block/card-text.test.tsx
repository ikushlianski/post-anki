import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardText } from './card-text'
import { CODE_WRAP_STORAGE_KEY } from './use-code-wrap-preference'

const FENCED = 'What does this print?\n```python\ndef f(x):\n    return x  # long line\n```\nThanks'

describe('CardText', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  it('should render a plain card exactly as the single paragraph it was before', () => {
    const { container } = render(<CardText text="What is a closure?" className="a" testId="t" />)

    expect(container.innerHTML).toBe('<p data-testid="t" class="a">What is a closure?</p>')
    expect(screen.queryByTestId('code-block')).toBeNull()
  })

  it('should keep the indentation of fenced code exactly', () => {
    render(<CardText text={FENCED} />)

    expect(screen.getByTestId('code-block-pre').textContent).toBe('def f(x):\n    return x  # long line')
  })

  it('should keep the prose around the code', () => {
    render(<CardText text={FENCED} testId="t" />)

    expect(screen.getByTestId('t').textContent).toContain('What does this print?')
    expect(screen.getByTestId('t').textContent).toContain('Thanks')
  })

  it('should wrap long lines by default while preserving indentation', () => {
    render(<CardText text={FENCED} />)

    expect(screen.getByTestId('code-block-pre').className).toContain('whitespace-pre-wrap')
  })

  it('should colour known languages and leave unknown or missing ones as plain monospace', () => {
    const { unmount } = render(<CardText text={'```python\nreturn 1\n```'} />)

    expect(screen.getByTestId('code-block-pre').querySelector('.hljs-keyword')).not.toBeNull()
    unmount()
    render(<CardText text={'```brainfuck\n++[>+<-]\n```'} />)

    expect(screen.getByTestId('code-block-pre').querySelector('span')).toBeNull()
    expect(screen.getByTestId('code-block-pre').textContent).toBe('++[>+<-]')
  })

  it('should copy only the code, without fences or prose', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    Object.assign(navigator, { clipboard: { writeText } })
    render(<CardText text={FENCED} />)
    fireEvent.click(screen.getByTestId('code-block-copy'))

    expect(writeText).toHaveBeenCalledWith('def f(x):\n    return x  # long line')
  })

  it('should remember the wrap choice for the next card', () => {
    const { unmount } = render(<CardText text={FENCED} />)

    fireEvent.click(screen.getByTestId('code-block-wrap'))
    expect(screen.getByTestId('code-block-pre').className).not.toContain('whitespace-pre-wrap')
    expect(window.localStorage.getItem(CODE_WRAP_STORAGE_KEY)).toBe('off')
    unmount()
    render(<CardText text={FENCED} />)

    expect(screen.getByTestId('code-block-pre').getAttribute('data-wrap')).toBe('off')
  })

  it('should still work when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(<CardText text={FENCED} />)

    expect(screen.getByTestId('code-block-pre').getAttribute('data-wrap')).toBe('on')
    vi.restoreAllMocks()
  })
})
