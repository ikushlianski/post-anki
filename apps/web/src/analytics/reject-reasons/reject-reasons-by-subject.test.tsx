import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RejectReasonsBySubject } from './reject-reasons-by-subject'

describe('RejectReasonsBySubject', () => {
  it('should list subjects in the given order with "x of y rejected"', () => {
    render(
      <RejectReasonsBySubject
        bySubject={[
          { subjectName: 'SQL', rejected: 4, decided: 5, rejectRate: 0.8 },
          { subjectName: 'Go', rejected: 2, decided: 10, rejectRate: 0.2 },
        ]}
      />,
    )

    const rows = screen.getAllByTestId('reject-by-subject-row')

    expect(rows[0]?.textContent).toContain('SQL')
    expect(rows[0]?.textContent).toContain('4 of 5 rejected')
    expect(rows[1]?.textContent).toContain('2 of 10 rejected')
  })

  it('should show a plain empty state when no subject has enough decisions', () => {
    render(<RejectReasonsBySubject bySubject={[]} />)

    expect(screen.getByText('Not enough decisions yet')).toBeTruthy()
  })
})
