export type TagControlState = 'hidden' | 'preparing' | 'busy' | 'ready'

export function tagControlState({
  editable,
  hydrated,
  busy,
}: {
  editable: boolean
  hydrated: boolean
  busy: boolean
}): TagControlState {
  if (!editable) {
    return 'hidden'
  }

  if (!hydrated) {
    return 'preparing'
  }

  if (busy) {
    return 'busy'
  }

  return 'ready'
}

export function isTagControlDisabled(state: TagControlState): boolean {
  return state !== 'ready'
}

export function tagControlHint(state: TagControlState): string | undefined {
  if (state === 'preparing') {
    return 'Still loading — this control is not ready yet'
  }

  return undefined
}
