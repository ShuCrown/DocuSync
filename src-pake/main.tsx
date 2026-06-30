/* eslint-disable react-refresh/only-export-components -- entry point, not a component file */
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import './pake.css'
import App from '../src/App'
import { PakeProvider } from './PakeProvider'
import { PakeOverlay } from './PakeOverlay'

const SharePreview = lazy(() => import('../src/pages/SharePreview'))

const isSharePage = window.location.pathname.startsWith('/share/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PakeProvider>
      {isSharePage ? (
        <Suspense fallback={
          <div className="h-screen flex items-center justify-center bg-surface text-text-secondary">
            加载中...
          </div>
        }>
          <SharePreview />
        </Suspense>
      ) : (
        <>
          <App />
          <PakeOverlay />
        </>
      )}
    </PakeProvider>
  </StrictMode>,
)
