// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { RejectReasonsByType } from './reject-reasons-by-type'

describe('RejectReasonsByType', () => {
  afterEach(cleanup)

  it('should list each subject type with its own reasons and hide types with no rejections', () => {
    render(
      <RejectReasonsByType
        byType={[
          { subjectType: 'programming', total: 0, reasons: [] },
          {
            subjectType: 'language',
            total: 3,
            reasons: [{ reasonCode: 'front_unclear_target_phrase', count: 3, share: 1 }],
          },
        ]}
      />,
    )

    expect(screen.getByTestId('reject-reasons-type-language-front_unclear_target_phrase').textContent).toContain('3 (100%)')
    expect(screen.queryByTestId('reject-reasons-type-programming')).toBeNull()
  })

  it('should render nothing when no type has rejections', () => {
    const { container } = render(<RejectReasonsByType byType={[{ subjectType: 'other', total: 0, reasons: [] }]} />)

    expect(container.innerHTML).toBe('')
  })
})
