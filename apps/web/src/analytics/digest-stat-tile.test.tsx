// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { DigestStatTile } from './digest-stat-tile'

afterEach(cleanup)

describe('DigestStatTile', () => {
  it('renders the label and value', () => {
    render(<DigestStatTile label="Retention" value="88% avg · 4 gaps" />)

    expect(screen.getByText('Retention')).toBeTruthy()
    expect(screen.getByText('88% avg · 4 gaps')).toBeTruthy()
  })
})
