import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { useUpdater, downloadAndInstallUpdate } from '../hooks/useUpdater'

/**
 * Non-blocking startup banner shown when the auto-update check (run on app
 * mount from App.tsx) finds a newer release. Lets the user update immediately
 * or defer; deferring only hides the banner locally this session - the update
 * stays visible in the settings panel. Tauri only (the store is inert in the
 * browser, so this renders nothing there).
 */
export function UpdateBanner() {
  const u = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  const active = u.status === 'available' || u.status === 'downloading' || u.status === 'installing'
  if (!active) return null
  if (u.status === 'available' && dismissed) return null

  return (
    <div className="fixed bottom-4 left-4 z-[9997] w-72 bg-surface-card border border-border rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] p-3 space-y-2">
      {u.status === 'available' && (
        <>
          <div className="flex items-start gap-2">
            <Download className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text">发现新版本 {u.version}</p>
              {u.notes && (
                <p className="text-xs text-text-secondary mt-1 line-clamp-3 whitespace-pre-wrap">
                  {u.notes}
                </p>
              )}
            </div>
            <button
              onClick={() => setDismissed(true)}
              title="稍后"
              className="p-0.5 rounded text-text-secondary hover:bg-surface-alt transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => downloadAndInstallUpdate()}
            className="w-full px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
          >
            立即更新
          </button>
        </>
      )}

      {(u.status === 'downloading' || u.status === 'installing') && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-text-secondary">
            <span>{u.status === 'downloading' ? '下载更新中…' : '安装中，即将重启…'}</span>
            {u.status === 'downloading' && u.progress != null && (
              <span>{Math.round(u.progress * 100)}%</span>
            )}
          </div>
          {u.status === 'downloading' && (
            <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(u.progress ?? 0) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
