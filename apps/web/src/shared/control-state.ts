export type ControlState = 'hidden' | 'preparing' | 'busy' | 'ready'

export function controlState({
  editable,
  hydrated,
  busy,
}: {
  editable: boolean
  hydrated: boolean
  busy: boolean
}): ControlState {
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

export function isControlDisabled(state: ControlState): boolean {
  return state !== 'ready'
}

export function controlHint(state: ControlState): string | undefined {
  if (state === 'preparing') {
    return 'Still loading — this control is not ready yet'
  }

  return undefined
}
