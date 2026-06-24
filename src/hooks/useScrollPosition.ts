import { useRef, useCallback, useLayoutEffect } from 'react'

interface ScrollPosition {
  x: number
  y: number
}

// Module-level cache: keyed by document identifier, survives React re-renders.
const scrollCache = new Map<string, ScrollPosition>()

/** Find the nearest scrollable element starting from `el`, walking depth-first into children. */
export function findScrollable(el: Element | null): Element | null {
  if (!el) return null
  const style = getComputedStyle(el)
  if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
    return el
  }
  for (const child of Array.from(el.children)) {
    const found = findScrollable(child)
    if (found) return found
  }
  return null
}

/**
 * Persist and restore scroll position for a document across mounts/unmounts.
 *
 * @param key   Document identifier (e.g. docId or file.name). `null` disables tracking.
 * @param initialPosition  Optional position to restore on first mount (for single→split transitions).
 * @returns A ref-callback to attach to the pane's wrapper element.
 */
export function useScrollPosition(
  key: string | null,
  initialPosition?: ScrollPosition | null,
): (el: HTMLDivElement | null) => void {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef(false)
  const restoreRafRef = useRef(0)

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    activeRef.current = !!el
    wrapperRef.current = el
  }, [])

  // Save on scroll and on unmount/key change; restore when the async viewer
  // has created a real scrollable surface.
  useLayoutEffect(() => {
    if (!key) return

    let cancelled = false
    let trackedEl: Element | null = null
    let attempts = 0
    const cached = scrollCache.get(key) ?? initialPosition

    const save = () => {
      const el = trackedEl ?? findScrollable(wrapperRef.current) ?? wrapperRef.current
      if (!el) return
      scrollCache.set(key, {
        x: el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0,
        y: el.scrollHeight > el.clientHeight ? el.scrollTop / (el.scrollHeight - el.clientHeight) : 0,
      })
    }

    const track = (el: Element) => {
      if (trackedEl === el) return
      trackedEl?.removeEventListener('scroll', save)
      trackedEl = el
      trackedEl.addEventListener('scroll', save, { passive: true })
    }

    const tryRestoreAndTrack = () => {
      if (cancelled || !activeRef.current) return

      const scrollable = findScrollable(wrapperRef.current)
      if (scrollable) {
        track(scrollable)
        const maxY = scrollable.scrollHeight - scrollable.clientHeight
        const maxX = scrollable.scrollWidth - scrollable.clientWidth
        if (cached && maxY > 0) scrollable.scrollTop = cached.y * maxY
        if (cached && maxX > 0) scrollable.scrollLeft = cached.x * maxX
        save()
        return
      }

      // PDF/Office viewers often become scrollable only after async parsing or
      // page rendering. Keep polling briefly so layout toggles do not lose place.
      if (attempts < 90) {
        attempts += 1
        restoreRafRef.current = requestAnimationFrame(tryRestoreAndTrack)
      }
    }

    restoreRafRef.current = requestAnimationFrame(tryRestoreAndTrack)

    return () => {
      cancelled = true
      cancelAnimationFrame(restoreRafRef.current)
      save()
      trackedEl?.removeEventListener('scroll', save)
    }
  }, [key, initialPosition])

  return refCallback
}
