import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from 'react'

interface ZoomScrollerProps {
  docZoom: number
  children: React.ReactNode
}

/**
 * Per-preview scroll + zoom wrapper. The scroller (.doc-zoom-scroller) sits
 * OUTSIDE the zoom layer (.doc-zoom-layer), so the viewport and its scrollbar
 * stay full-height at any zoom while only the content scales; each split pane
 * owns its own ZoomScroller so panes scroll INDEPENDENTLY. The zoom layer has
 * no fixed height — content sizes it, so the scroller sees the full (scaled)
 * content height and can scroll to the bottom.
 *
 * To keep the pane looking filled when a document has little content, the
 * zoom layer gets a REAL pixel `min-height = scrollerClientHeight / docZoom`
 * (measured with a ResizeObserver) — after the scale transform the visible
 * height is exactly the viewport. A measured length (not `calc(100%/zoom)`)
 * is used because percentage heights inside the layer can only resolve
 * against a definite length: `min-height` on the parent is NOT treated as
 * definite by the CSS spec, which is why pure-calc min-heights let child
 * `h-full` wrappers collapse back to content height. The layer is also a
 * column flex container, so direct children with `flex-grow` reliably fill
 * it regardless of percentage resolution.
 *
 * Extracted from App.tsx so the recursive SplitGroup renderer can hand each
 * leaf its own instance with a stable ref (for scroll-position tracking).
 */
export const ZoomScroller = forwardRef<HTMLDivElement, ZoomScrollerProps>(
  ({ docZoom, children }, ref) => {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const [viewportH, setViewportH] = useState(0)

    // Merge the forwarded ref (used by useScrollPosition) with our own, so we
    // can observe the scroller's viewport height.
    const setRefs = useCallback(
      (el: HTMLDivElement | null) => {
        scrollerRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      },
      [ref],
    )

    useLayoutEffect(() => {
      const el = scrollerRef.current
      if (!el) return
      const update = () => setViewportH(el.clientHeight)
      update()
      const ro = new ResizeObserver(update)
      ro.observe(el)
      return () => ro.disconnect()
    }, [])

    return (
      <div ref={setRefs} className="doc-zoom-scroller flex-1 min-h-0 overflow-auto">
        <div
          className="doc-zoom-layer"
          style={{
            width: `calc(100% / ${docZoom})`,
            minHeight: viewportH > 0 ? `${viewportH / docZoom}px` : undefined,
            display: 'flex',
            flexDirection: 'column',
            transform: `scale(${docZoom})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    )
  },
)
ZoomScroller.displayName = 'ZoomScroller'
