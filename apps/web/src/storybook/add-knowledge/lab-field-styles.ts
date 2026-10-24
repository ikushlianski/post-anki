export type Look = 'app' | 'soft'

const BASE =
  'w-full min-h-[44px] px-3 py-2 text-left text-sm text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0'

const APP = 'rounded-md border border-neutral-300 bg-white outline-none focus:border-neutral-500'

const SOFT =
  'rounded-md bg-neutral-100/70 hover:bg-neutral-100 focus:bg-white focus:outline-2 focus:outline-neutral-300'

export function fieldClass(look: Look): string {
  return `${BASE} ${look === 'app' ? APP : SOFT}`
}

export const POPOVER_CLASS =
  'absolute z-30 mt-1 max-h-72 w-max min-w-full max-w-[min(30rem,calc(100vw-2rem))] overflow-auto rounded-lg bg-white p-1 shadow-lg ring-1 ring-neutral-200'

export function optionClass(active: boolean, selected: boolean): string {
  const tone = active ? 'bg-neutral-100' : 'bg-white'
  const weight = selected ? 'font-semibold' : 'font-normal'

  return `flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-neutral-900 sm:min-h-9 ${tone} ${weight}`
}
