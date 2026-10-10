import { describe, expect, it } from 'vitest'

import type { Subject } from '../curriculum/model'
import { ancestorIdsOf } from './use-subject-placement'

function subject(id: string, parentId: string | null): Subject {
  return { id, name: id, kind: 'architecture-mentor', requireSources: false, modelTier: null, parentId }
}

describe('ancestorIdsOf', () => {
  it('should list every parent from the nearest one up to the top level', () => {
    const subjects = [subject('root', null), subject('mid', 'root'), subject('leaf', 'mid')]

    expect(ancestorIdsOf('leaf', subjects)).toEqual(['mid', 'root'])
  })

  it('should stop at a parent cycle instead of looping forever', () => {
    const subjects = [subject('a', 'b'), subject('b', 'a')]

    expect(ancestorIdsOf('a', subjects)).toEqual(['b'])
  })
})
