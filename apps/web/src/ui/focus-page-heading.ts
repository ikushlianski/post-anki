export function focusPageHeading(): void {
  const heading = document.querySelector<HTMLElement>('main h1')

  if (!heading) {
    return
  }

  heading.tabIndex = -1
  heading.focus()
}
