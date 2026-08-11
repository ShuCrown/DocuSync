import { createContext, useContext } from 'react'

/**
 * GLOBAL UI zoom scale (1 = 100%), controlled from the Settings panel. It is
 * applied as `transform: scale()` on the app root wrapper, so everything is
 * laid out in "logical" coordinates (real viewport size divided by the scale)
 * — consumers that measure the viewport must divide by the scale, use
 * `useLogicalViewport()` for that.
 *
 * Region zoom layers stack ON TOP of this global scale (each transform
 * multiplies): the document area has its own wrapper (header button) and each
 * chat panel scales independently (panel header control). The global zoom
 * adapts the whole UI to the window; the region zooms fine-tune each area.
 */
export const ZoomScaleContext = createContext<number>(1)

export const useZoomScale = (): number => useContext(ZoomScaleContext)

/** Logical viewport size — what the app's coordinate system sees after the
 * global zoom. The scaled wrapper becomes the containing block for
 * fixed-position elements, so their coordinates are logical; real
 * `window.innerWidth/innerHeight` are only correct when divided by the scale. */
export function useLogicalViewport(): { width: number; height: number } {
  const scale = useZoomScale()
  return {
    width: typeof window !== 'undefined' ? window.innerWidth / scale : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight / scale : 800,
  }
}
