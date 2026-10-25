import { describe, expect, it } from 'vitest'

import { openNavigationMode, rowClickIntent, withOpen } from './knowledge-browser-open-item'

const plain = { shiftKey: false, metaKey: false, ctrlKey: false }

function elementIn(html: string, selector: string): Element {
  const host = document.createElement('div')

  host.innerHTML = html

  return host.querySelector(selector) as Element
}

describe('rowClickIntent', () => {
  it('should open the piece when a row is clicked with no modifier', () => {
    expect(rowClickIntent({ ...plain, target: elementIn('<td>text</td>', 'td') })).toBe('open')
  })

  it('should select the range on shift-click and toggle one piece on command or control click', () => {
    const target = elementIn('<td>text</td>', 'td')

    expect(rowClickIntent({ ...plain, shiftKey: true, target })).toBe('range')
    expect(rowClickIntent({ ...plain, metaKey: true, target })).toBe('toggle')
    expect(rowClickIntent({ ...plain, ctrlKey: true, target })).toBe('toggle')
  })

  it('should ignore clicks on a link, button, input or label inside the row', () => {
    for (const html of ['<a href="x">l</a>', '<button>b</button>', '<input />', '<label>l</label>']) {
      const target = elementIn(`<td>${html}</td>`, 'a, button, input, label')

      expect(rowClickIntent({ ...plain, target })).toBe('ignore')
    }
  })
})

describe('openNavigationMode', () => {
  it('should add a history entry when opening from a closed panel', () => {
    expect(openNavigationMode(undefined, 'b1')).toBe('push')
  })

  it('should replace the entry when switching pieces or closing', () => {
    expect(openNavigationMode('b1', 'b2')).toBe('replace')
    expect(openNavigationMode('b1', null)).toBe('replace')
  })
})

describe('withOpen', () => {
  it('should carry the open piece alongside the filters and drop it when closed', () => {
    expect(withOpen({ subject: 's1', question: 'pod' }, 'b1')).toEqual({ subject: 's1', question: 'pod', open: 'b1' })
    expect(withOpen({ subject: 's1', open: 'b1' }, null)).toEqual({ subject: 's1' })
  })

  it('should replace the open piece when another one is given', () => {
    expect(withOpen({ open: 'b1' }, 'b2')).toEqual({ open: 'b2' })
  })
})
