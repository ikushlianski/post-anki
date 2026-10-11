import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { SubjectCombobox } from './subject-combobox'

const OPTIONS = [
  { id: 'a', label: 'Business › Sales' },
  { id: 'b', label: 'Programming / Web Development › Databases' },
]

function Harness() {
  const [value, setValue] = useState('')

  return (
    <>
      <SubjectCombobox ariaLabel="Subject" options={OPTIONS} value={value} onChange={setValue} />
      <output data-testid="chosen">{value}</output>
    </>
  )
}

describe('SubjectCombobox', () => {
  it('should offer every subject path as a searchable suggestion', () => {
    const { container } = render(<Harness />)

    expect(container.querySelectorAll('datalist option')).toHaveLength(2)
  })

  it('should choose the subject once the typed text matches a full path', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByLabelText('Subject'), 'business › sales')

    expect(screen.getByTestId('chosen').textContent).toBe('a')
  })

  it('should keep no subject chosen while the text is only a partial search', async () => {
    render(<Harness />)

    await userEvent.type(screen.getByLabelText('Subject'), 'Sal')

    expect(screen.getByTestId('chosen').textContent).toBe('')
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Sal')
  })
})
