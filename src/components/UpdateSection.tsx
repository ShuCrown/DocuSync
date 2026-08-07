import { RefreshCw, Download, Check, AlertCircle } from 'lucide-react'
import { useUpdater, checkForUpdate, downloadAndInstallUpdate } from '../hooks/useUpdater'

/**
 * Settings-panel section for checking and applying app updates (Tauri only).
 * Rendered by SettingsPanel when running inside the desktop shell.
 */
export function UpdateSection() {
  const u = useUpdater()

  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-sm font-medium text-text">应用更新</p>
        <p className="text-xs text-text-secondary mt-0.5">
          检查并安装最新版本{u.currentVersion ? `（当前 ${u.currentVersion}）` : ''}
        </p>
      </div>

      {/* Idle / up-to-date: offer a manual check. */}
      {(u.status === 'idle' || u.status === 'up-to-date') && (
        <button
          onClick={() => checkForUpdate()}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
        >
          {u.status === 'up-to-date' ? (
            <>
              <Check className="w-3.5 h-3.5 text-primary" />
              已是最新版本，再次检查
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              检查更新
            </>
          )}
        </button>
      )}

      {u.status === 'checking' && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          检查中…
        </div>
      )}

      {u.status === 'error' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 px-3 py-2 text-xs text-error bg-error/5 border border-error/10 rounded-md">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="break-all">检查失败：{u.error}</span>
          </div>
          <button
            onClick={() => checkForUpdate()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            重试
          </button>
        </div>
      )}

      {u.status === 'available' && (
        <div className="space-y-2 p-3 border border-primary/30 bg-primary/5 rounded-md">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-text">发现新版本 {u.version}</span>
          </div>
          {u.notes && (
            <p className="text-xs text-text-secondary whitespace-pre-wrap line-clamp-6">
              {u.notes}
            </p>
          )}
          <button
            onClick={() => downloadAndInstallUpdate()}
            className="w-full px-3 py-2 text-xs font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
          >
            下载并安装
          </button>
        </div>
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
