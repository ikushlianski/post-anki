// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ConfirmDelete } from './shape-controls'

describe('ConfirmDelete', () => {
  afterEach(cleanup)

  it('should spell out what gets deleted only once the delete is armed', () => {
    render(
      <ConfirmDelete busy={false} hydrated label="Delete curriculum" consequence="Deletes its sources and topics" onConfirm={() => {}} />,
    )

    expect(screen.queryByText('Deletes its sources and topics')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Deletes its sources and topics')).toBeTruthy()
  })
})
