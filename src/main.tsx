import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const SharePreview = lazy(() => import('./pages/SharePreview'))

const isSharePage = window.location.pathname.startsWith('/share/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSharePage ? (
      <Suspense fallback={
        <div className="h-screen flex items-center justify-center bg-surface text-text-secondary">
          加载中...
        </div>
      }>
        <SharePreview />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
