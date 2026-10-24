import { useEffect, useState } from 'react'

export function useKeyboardOffset(active: boolean): number {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const viewport = typeof window === 'undefined' ? undefined : window.visualViewport

    if (!active || !viewport) {
      setOffset(0)

      return
    }

    function update() {
      if (!viewport) {
        return
      }

      setOffset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)

    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [active])

  return offset
}

export function useMobileScrollLock(active: boolean) {
  useEffect(() => {
    const isPhone =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 639px)').matches

    if (!active || !isPhone) {
      return
    }

    const previous = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
    }
  }, [active])
}
