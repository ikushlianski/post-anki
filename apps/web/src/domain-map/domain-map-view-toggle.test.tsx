// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { DomainMapViewToggle } from './domain-map-view-toggle'

afterEach(() => {
  cleanup()
})

// visual-knowledge-map (issue #86), SCENARIO 1 — default view is List (zero
// behavior change for anyone who never touches the toggle), and selecting
// Map notifies the parent so it can switch the rendered view.
describe('DomainMapViewToggle', () => {
  it('marks List as the selected tab when the parent defaults the view to list', () => {
    render(<DomainMapViewToggle view="list" onChange={vi.fn()} />)

    expect(screen.getByTestId('domain-map-view-toggle-list').getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByTestId('domain-map-view-toggle-graph').getAttribute('aria-selected')).toBe(
      'false',
    )
  })

  it('calls onChange with "map" when the Map tab is clicked', () => {
    const onChange = vi.fn()

    render(<DomainMapViewToggle view="list" onChange={onChange} />)
    screen.getByTestId('domain-map-view-toggle-graph').click()

    expect(onChange).toHaveBeenCalledWith('map')
  })

  it('calls onChange with "list" when the List tab is clicked from Map view', () => {
    const onChange = vi.fn()

    render(<DomainMapViewToggle view="map" onChange={onChange} />)
    screen.getByTestId('domain-map-view-toggle-list').click()

    expect(onChange).toHaveBeenCalledWith('list')
  })
})
