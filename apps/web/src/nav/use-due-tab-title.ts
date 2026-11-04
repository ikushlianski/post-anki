import { useEffect } from 'react'

export const BASE_TAB_TITLE = 'Post Anki'

const COUNT_PREFIX = /^\(\d+\)\s*/

export function dueTabTitle(due: number | null, pageTitle: string = BASE_TAB_TITLE): string {
  const page = pageTitle.replace(COUNT_PREFIX, '') || BASE_TAB_TITLE

  return due !== null && due > 0 ? `(${due}) ${page}` : page
}

export function useDueTabTitle(due: number | null) {
  useEffect(() => {
    if (due === null) {
      document.title = dueTabTitle(null, document.title)

      return
    }

    function apply() {
      const next = dueTabTitle(due, document.title)

      if (document.title !== next) {
        document.title = next
      }
    }

    apply()

    const observer = new MutationObserver(apply)

    observer.observe(document.head, { childList: true, characterData: true, subtree: true })

    return () => observer.disconnect()
  }, [due])
}
