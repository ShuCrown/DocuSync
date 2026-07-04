import { useState, useEffect, useSyncExternalStore } from 'react'
import { X, Settings, HardDrive, Cloud, Check, AlertCircle, RotateCw, FolderOpen } from 'lucide-react'
import {
  getStorageMode,
  setStorageMode,
  getRemoteApiBase,
  setRemoteApiBase,
  resetRemoteApiBase,
  getLocalStorageRoot,
  openLocalStorageFolder,
  subscribe,
  canUseLocalMode,
  type StorageMode,
} from '../lib/storage-mode'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

function useStorageMode() {
  return useSyncExternalStore(
    subscribe,
    () => getStorageMode(),
    () => 'remote' as StorageMode,
  )
}

function useRemoteBase() {
  return useSyncExternalStore(
    subscribe,
    () => getRemoteApiBase(),
    () => 'https://docusync.pages.dev/api',
  )
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const mode = useStorageMode()
  const remoteBase = useRemoteBase()

  if (!open) return null

  return <SettingsPanelBody
    key={remoteBase}
    mode={mode}
    remoteBase={remoteBase}
    onClose={onClose}
  />
}

interface BodyProps {
  mode: StorageMode
  remoteBase: string
  onClose: () => void
}

function SettingsPanelBody({ mode, remoteBase, onClose }: BodyProps) {
  const [pendingMode, setPendingMode] = useState<StorageMode | null>(null)
  const [baseInput, setBaseInput] = useState(remoteBase)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localPath, setLocalPath] = useState<string | null>(null)

  const effectiveMode = pendingMode ?? mode
  const localAvailable = canUseLocalMode()

  useEffect(() => {
    if (effectiveMode === 'local' && localAvailable) {
      getLocalStorageRoot().then(setLocalPath).catch(() => setLocalPath(null))
    } else {
      setLocalPath(null)
    }
  }, [effectiveMode, localAvailable])

  const modeChanged = pendingMode !== null && pendingMode !== mode
  const baseChanged = effectiveMode === 'remote' && baseInput.trim() !== remoteBase
  const hasChanges = modeChanged || baseChanged

  const handleModeChange = (next: StorageMode) => {
    setError(null)
    if (next === 'local' && !localAvailable) {
      setError('本地模式仅在桌面应用中可用，浏览器无法访问本地文件系统')
      return
    }
    if (next === effectiveMode) return
    setPendingMode(next)
    setShowConfirm(false)
  }

  const handleResetBase = () => {
    setBaseInput('https://docusync.pages.dev/api')
    setShowConfirm(false)
  }

  const handleSave = () => {
    setError(null)
    if (!hasChanges) {
      onClose()
      return
    }

    if (baseChanged) {
      const trimmed = baseInput.trim()
      if (trimmed && !/^https?:\/\//.test(trimmed)) {
        setError('远端地址需以 http:// 或 https:// 开头')
        return
      }
    }

    setShowConfirm(true)
  }

  const handleConfirm = () => {
    setError(null)

    try {
      if (modeChanged && pendingMode) {
        setStorageMode(pendingMode)
      }

      if (baseChanged) {
        const finalBase = baseInput.trim() || 'https://docusync.pages.dev/api'
        if (finalBase === 'https://docusync.pages.dev/api') {
          resetRemoteApiBase()
        } else {
          setRemoteApiBase(finalBase)
        }
      }

      // Reload so api.ts re-reads storage mode / BASE on next import.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setShowConfirm(false)
    }
  }

  const handleCancelConfirm = () => {
    setShowConfirm(false)
  }

  const handleOpenFolder = async () => {
    setError(null)
    try {
      await openLocalStorageFolder()
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法打开文件夹')
    }
  }

  const confirmDescription = () => {
    if (modeChanged && baseChanged) {
      return `切换到「${pendingMode === 'local' ? '本地存储' : '云端存储'}」并更新远端服务地址，页面将重新加载，当前打开的文档会关闭`
    }
    if (modeChanged && pendingMode) {
      return `切换到「${pendingMode === 'local' ? '本地存储' : '云端存储'}」，页面将重新加载，当前打开的文档会关闭`
    }
    return '远端服务地址已修改，页面将重新加载以生效'
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.12)] w-full max-w-md mx-4 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4.5 h-4.5 text-primary" />
            <span className="text-sm font-medium text-text">设置</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-surface-alt transition-colors text-text-secondary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-error/5 border border-error/10 rounded-md text-sm text-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Storage mode section */}
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-medium text-text">存储模式</p>
              <p className="text-xs text-text-secondary mt-0.5">
                选择文档和历史的存储位置
              </p>
            </div>

            <div className="space-y-2">
              {/* Local option */}
              <button
                onClick={() => handleModeChange('local')}
                disabled={!localAvailable}
                className={`w-full flex items-start gap-3 p-3 rounded-md border transition-colors text-left ${
                  effectiveMode === 'local'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-alt/50'
                } ${!localAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <HardDrive className={`w-4 h-4 shrink-0 mt-0.5 ${effectiveMode === 'local' ? 'text-primary' : 'text-text-secondary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">本地存储</span>
                    {effectiveMode === 'local' && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    文件保存在本机磁盘，离线可用
                  </p>
                  {!localAvailable && (
                    <p className="text-[11px] text-text-secondary mt-1">
                      仅桌面应用可用
                    </p>
                  )}
                </div>
              </button>

              {/* Remote option */}
              <button
                onClick={() => handleModeChange('remote')}
                className={`w-full flex items-start gap-3 p-3 rounded-md border transition-colors text-left ${
                  effectiveMode === 'remote'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-alt/50'
                }`}
              >
                <Cloud className={`w-4 h-4 shrink-0 mt-0.5 ${effectiveMode === 'remote' ? 'text-primary' : 'text-text-secondary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">云端存储</span>
                    {effectiveMode === 'remote' && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    文件存于 Cloudflare，跨设备同步，支持分享与账号绑定
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Remote API base — only shown in remote mode. */}
          {effectiveMode === 'remote' && (
            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-medium text-text">远端服务地址</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  云端模式的数据接口地址
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={baseInput}
                  onChange={(e) => {
                    setBaseInput(e.target.value)
                    setShowConfirm(false)
                  }}
                  placeholder="https://your-worker.example.com/api"
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-text placeholder:text-text-secondary/50"
                />
                <button
                  onClick={handleResetBase}
                  className="px-3 py-2 text-xs text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
                  title="恢复默认"
                >
                  默认
                </button>
              </div>
            </div>
          )}

          {/* Local storage path — current mode only, not customizable yet. */}
          {effectiveMode === 'local' && (
            <div className="space-y-2.5">
              <div>
                <p className="text-sm font-medium text-text">本地存储位置</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  当前文件与数据库保存目录
                </p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 text-xs border border-border rounded-md bg-surface-alt/40 text-text-secondary truncate">
                  {localPath ?? '加载中…'}
                </div>
                <button
                  onClick={handleOpenFolder}
                  disabled={!localPath}
                  className="flex items-center gap-1 px-3 py-2 text-xs text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="打开文件夹"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  打开
                </button>
              </div>
            </div>
          )}

          {/* Mode-specific hint */}
          {effectiveMode === 'local' && (
            <div className="text-xs text-text-secondary p-3 bg-surface-alt/40 rounded-md">
              本地模式下：账号绑定、文档分享功能不可用。
            </div>
          )}
          {effectiveMode === 'remote' && (
            <div className="text-xs text-text-secondary p-3 bg-surface-alt/40 rounded-md">
              云端模式下：所有功能可用，数据存于 Cloudflare R2 + D1。
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
          >
            关闭
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>

        {/* Secondary confirmation — only shown when there are unsaved changes. */}
        {showConfirm && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[2px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-surface-card border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.12)] w-full max-w-sm mx-4 p-4 space-y-4">
              <div className="flex items-start gap-3">
                <RotateCw className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-text">确认保存修改？</p>
                  <p className="text-xs text-text-secondary mt-1">
                    {confirmDescription()}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCancelConfirm}
                  className="flex-1 px-3 py-2 text-sm text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
