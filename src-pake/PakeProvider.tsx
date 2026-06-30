import { createContext, useEffect, type ReactNode } from 'react'
import { config, type PakeConfig } from './config'

// eslint-disable-next-line react-refresh/only-export-components -- context + component co-located by design
export const PakeCtx = createContext<PakeConfig>(config)

interface Props {
  children: ReactNode
}

export function PakeProvider({ children }: Props) {
  // Apply body class for private mode (used by pake.css to hide features)
  useEffect(() => {
    if (config.mode === 'private') {
      document.body.classList.add('mode-private')
    }
    return () => { document.body.classList.remove('mode-private') }
  }, [])

  return <PakeCtx.Provider value={config}>{children}</PakeCtx.Provider>
}
