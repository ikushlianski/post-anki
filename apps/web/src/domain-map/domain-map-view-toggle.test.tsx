// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { DomainMapViewToggle } from './domain-map-view-toggle'

afterEach(() => {
  cleanup()
})

// visual-knowledge-map (issue #86), SCENARIO 1 — default view is List (zero
// behavior change for anyone who never touches the toggle), and selecting
// Tree/Mind-map notifies the parent so it can switch the rendered view.
//
// #86 widened (mind-map/tree-hierarchy dual view), AC 19/20 — the toggle now
// carries three tabs instead of two; re-verified against all three.
describe('DomainMapViewToggle', () => {
  it('marks List as the selected tab when the parent defaults the view to list', () => {
    render(<DomainMapViewToggle view="list" onChange={vi.fn()} />)

    expect(screen.getByTestId('domain-map-view-toggle-list').getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByTestId('domain-map-view-toggle-tree').getAttribute('aria-selected')).toBe(
      'false',
    )
    expect(screen.getByTestId('domain-map-view-toggle-mindmap').getAttribute('aria-selected')).toBe(
      'false',
    )
  })

  it('calls onChange with "tree" when the Tree tab is clicked', () => {
    const onChange = vi.fn()

    render(<DomainMapViewToggle view="list" onChange={onChange} />)
    screen.getByTestId('domain-map-view-toggle-tree').click()

    expect(onChange).toHaveBeenCalledWith('tree')
  })

  it('calls onChange with "mindmap" when the Mind-map tab is clicked', () => {
    const onChange = vi.fn()

    render(<DomainMapViewToggle view="list" onChange={onChange} />)
    screen.getByTestId('domain-map-view-toggle-mindmap').click()

    expect(onChange).toHaveBeenCalledWith('mindmap')
  })

  it('calls onChange with "list" when the List tab is clicked from either graphical view', () => {
    const onChangeFromTree = vi.fn()

    render(<DomainMapViewToggle view="tree" onChange={onChangeFromTree} />)
    screen.getByTestId('domain-map-view-toggle-list').click()

    expect(onChangeFromTree).toHaveBeenCalledWith('list')

    cleanup()

    const onChangeFromMindmap = vi.fn()

    render(<DomainMapViewToggle view="mindmap" onChange={onChangeFromMindmap} />)
    screen.getByTestId('domain-map-view-toggle-list').click()

    expect(onChangeFromMindmap).toHaveBeenCalledWith('list')
  })

  it('gives every tab the 44px minimum touch-target sizing', () => {
    render(<DomainMapViewToggle view="list" onChange={vi.fn()} />)

    expect(screen.getByTestId('domain-map-view-toggle-list').className).toContain('min-h-11')
    expect(screen.getByTestId('domain-map-view-toggle-tree').className).toContain('min-h-11')
    expect(screen.getByTestId('domain-map-view-toggle-mindmap').className).toContain('min-h-11')
  })
})
