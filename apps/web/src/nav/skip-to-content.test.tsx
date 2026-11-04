// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { MAIN_CONTENT_ID, SkipToContent } from './skip-to-content'

afterEach(cleanup)

describe('SkipToContent', () => {
  it('should be the first tab stop and point at the main content wrapper', () => {
    render(
      <>
        <SkipToContent />
        <nav>
          <a href="/a">A</a>
        </nav>
        <div id={MAIN_CONTENT_ID} tabIndex={-1} />
      </>,
    )

    const first = document.querySelector<HTMLElement>('a[href], button, input, [tabindex]:not([tabindex="-1"])')

    expect(first).toBe(screen.getByRole('link', { name: 'Skip to content' }))
    expect(first?.getAttribute('href')).toBe(`#${MAIN_CONTENT_ID}`)
    expect(document.getElementById(MAIN_CONTENT_ID)).toBeTruthy()
  })
})
