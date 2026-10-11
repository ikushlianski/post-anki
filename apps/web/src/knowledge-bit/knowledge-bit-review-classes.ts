const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900'

export const PRIMARY_BUTTON_CLASS = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:px-3 sm:text-xs ${FOCUS_RING}`

export const SECONDARY_BUTTON_CLASS = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-neutral-100 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8 sm:px-3 sm:text-xs ${FOCUS_RING}`

export const TEXT_BUTTON_CLASS = `inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-xs sm:min-h-0 font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`

export const TEXT_FIELD_CLASS =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-900'
