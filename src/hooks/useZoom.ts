import { createContext } from 'react'

/**
 * GLOBAL UI zoom scale (1 = 100%), controlled from the Settings panel. It is
 * applied as `transform: scale()` on the app root wrapper, so everything is
 * laid out in "logical" coordinates (real viewport size divided by the scale).
 * The document-area zoom layer stacks ON TOP of this global scale (its
 * transform multiplies): the document area has its own wrapper (header
 * button). The global zoom adapts the whole UI to the window; the document
 * zoom fine-tunes the document area.
 */
export const ZoomScaleContext = createContext<number>(1)
