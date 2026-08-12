import { forwardRef } from 'react'

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
 * Extracted from App.tsx so the recursive SplitGroup renderer can hand each
 * leaf its own instance with a stable ref (for scroll-position tracking).
 */
export const ZoomScroller = forwardRef<HTMLDivElement, ZoomScrollerProps>(
  ({ docZoom, children }, ref) => (
    <div ref={ref} className="doc-zoom-scroller flex-1 min-h-0 overflow-auto">
      <div
        className="doc-zoom-layer"
        style={{
          width: `calc(100% / ${docZoom})`,
          transform: `scale(${docZoom})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  ),
)
ZoomScroller.displayName = 'ZoomScroller'
