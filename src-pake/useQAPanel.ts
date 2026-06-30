import { useState, useCallback, useRef } from 'react'

export type QAPanelMode = 'closed' | 'sidebar' | 'popup' | 'minimized'

export interface QAPanelState {
  mode: QAPanelMode
  serviceId: string | null
  serviceName: string
  serviceUrl: string
  selectedText: string
  /** Open sidebar with a service and selected text. */
  openSidebar: (serviceId: string, serviceName: string, serviceUrl: string, text: string) => void
  /** Toggle between sidebar and popup. */
  togglePopup: () => void
  /** Minimize to bubble. */
  minimize: () => void
  /** Restore from bubble to popup. */
  restore: () => void
  /** Close entirely. */
  close: () => void
  /** Open the current service in a browser window. */
  openServiceWindow: () => void
  /** Last opened window ref for reuse. */
  windowRef: React.MutableRefObject<Window | null>
}

export function useQAPanel(forcePopup = false): QAPanelState {
  const [mode, setMode] = useState<QAPanelMode>('closed')
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [serviceName, setServiceName] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [selectedText, setSelectedText] = useState('')
  const windowRef = useRef<Window | null>(null)

  const openSidebar = useCallback((id: string, name: string, url: string, text: string) => {
    setServiceId(id)
    setServiceName(name)
    setServiceUrl(url)
    setSelectedText(text)
    // In split mode, skip sidebar and go directly to popup
    setMode(forcePopup ? 'popup' : 'sidebar')
  }, [forcePopup])

  const togglePopup = useCallback(() => {
    setMode((prev) => (prev === 'sidebar' ? 'popup' : 'sidebar'))
  }, [])

  const minimize = useCallback(() => {
    setMode('minimized')
  }, [])

  const restore = useCallback(() => {
    setMode('popup')
  }, [])

  const close = useCallback(() => {
    setMode('closed')
    setServiceId(null)
    setSelectedText('')
  }, [])

  const openServiceWindow = useCallback(() => {
    if (!serviceUrl) return
    const w = 900, h = 700
    const features = `width=${w},height=${h},left=${Math.round((screen.width - w) / 2)},top=${Math.round((screen.height - h) / 2)},scrollbars=yes,resizable=yes`
    // Use fixed name per service to reuse the same window
    windowRef.current = window.open(serviceUrl, `qa-${serviceId}`, features)
  }, [serviceUrl, serviceId])

  return {
    mode,
    serviceId,
    serviceName,
    serviceUrl,
    selectedText,
    openSidebar,
    togglePopup,
    minimize,
    restore,
    close,
    openServiceWindow,
    windowRef,
  }
}
