import { BASE_TAB_TITLE } from '../nav/use-due-tab-title'

export function pageTitle(name: string): string {
  return `${name} · ${BASE_TAB_TITLE}`
}

export function pageHead(name: string) {
  return () => ({ meta: [{ title: pageTitle(name) }] })
}
