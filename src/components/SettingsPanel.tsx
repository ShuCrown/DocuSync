import { useState, useSyncExternalStore } from 'react'
import { X, Settings, HardDrive, Cloud, Check, AlertCircle, RotateCw } from 'lucide-react'
import {
  getStorageMode,
  setStorageMode,
  getRemoteApiBase,
  setRemoteApiBase,
  resetRemoteApiBase,
  subscribe,
  canUseLocalMode,
  type StorageMode,
} from '../lib/storage-mode'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
}

// useSyncExternalStore keeps the panel in sync with mode/base changes.
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

// Split into a body component so input state is freshly initialized each time
// the panel opens (via key remount in the parent), avoiding setState-in-effect.
function SettingsPanelBody({ mode, remoteBase, onClose }: BodyProps) {
  const [baseInput, setBaseInput] = useState(remoteBase)
  const [pendingMode, setPendingMode] = useState<StorageMode | null>(null)
  const [error, setError] = useState<string | null>(null)

  const localAvailable = canUseLocalMode()

  const handleModeChange = (next: StorageMode) => {
    setError(null)
    if (next === 'local' && !localAvailable) {
      setError('本地模式仅在桌面应用中可用，浏览器无法访问本地文件系统')
      return
    }
    if (next === mode) return
    // Defer until confirm — switching wipes the current view (history lives
    // in a different data source), so we ask the user first.
    setPendingMode(next)
  }

  const confirmSwitch = () => {
    if (!pendingMode) return
    try {
      setStorageMode(pendingMode)
      // Reload to flush in-memory cache (api.ts cache + history hook state)
      // and re-fetch from the new data source. Cleaner than manually
      // invalidating every cache layer.
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败')
      setPendingMode(null)
    }
  }

  const cancelSwitch = () => {
    setPendingMode(null)
  }

  const handleSaveBase = () => {
    const trimmed = baseInput.trim()
    if (trimmed && !/^https?:\/\//.test(trimmed)) {
      setError('远端地址需以 http:// 或 https:// 开头')
      return
    }
    setError(null)
    const finalBase = trimmed || 'https://docusync.pages.dev/api'
    if (finalBase === remoteBase) return
    setRemoteApiBase(finalBase)
    // Reload so api.ts re-reads BASE on next import — the module-level const
    // is evaluated once at load time.
    window.location.reload()
  }

  const handleResetBase = () => {
    resetRemoteApiBase()
    setBaseInput('https://docusync.pages.dev/api')
    window.location.reload()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-card border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.12)] w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
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
        <div className="p-5 space-y-5">
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
                  mode === 'local'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-alt/50'
                } ${!localAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <HardDrive className={`w-4 h-4 shrink-0 mt-0.5 ${mode === 'local' ? 'text-primary' : 'text-text-secondary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">本地存储</span>
                    {mode === 'local' && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    文件保存在本机磁盘，完全离线可用（AI 摘要仍需联网）
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
                  mode === 'remote'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-alt/50'
                }`}
              >
                <Cloud className={`w-4 h-4 shrink-0 mt-0.5 ${mode === 'remote' ? 'text-primary' : 'text-text-secondary'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">云端存储</span>
                    {mode === 'remote' && <Check className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    文件存于 Cloudflare，跨设备同步，支持分享与账号绑定
                  </p>
                </div>
              </button>
            </div>

            {/* Confirm switch */}
            {pendingMode && (
              <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <RotateCw className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs text-text flex-1">
                  切换到「{pendingMode === 'local' ? '本地存储' : '云端存储'}」将重新加载页面，当前打开的文档会关闭
                </span>
                <button
                  onClick={cancelSwitch}
                  className="px-2 py-1 text-[11px] text-text-secondary border border-border rounded hover:bg-surface-alt transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmSwitch}
                  className="px-2 py-1 text-[11px] text-white bg-primary rounded hover:bg-primary-dark transition-colors"
                >
                  确认
                </button>
              </div>
            )}
          </div>

          {/* Remote API base — only relevant when calling the Worker.
              Shown in both modes: remote mode uses it for everything,
              local mode uses it for AI summarization. */}
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-medium text-text">远端服务地址</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {mode === 'local'
                  ? '本地模式下用于 AI 摘要生成'
                  : '云端模式的数据接口地址'}
              </p>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseInput}
                onChange={(e) => setBaseInput(e.target.value)}
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
              <button
                onClick={handleSaveBase}
                disabled={baseInput.trim() === remoteBase}
                className="px-3 py-2 text-xs text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                保存
              </button>
            </div>
          </div>

          {/* Mode-specific hint */}
          {mode === 'local' && (
            <div className="text-xs text-text-secondary p-3 bg-surface-alt/40 rounded-md">
              本地模式下：账号绑定、文档分享功能不可用。AI 摘要需联网调用远端 Worker。
            </div>
          )}
          {mode === 'remote' && (
            <div className="text-xs text-text-secondary p-3 bg-surface-alt/40 rounded-md">
              云端模式下：所有功能可用，数据存于 Cloudflare R2 + D1。
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
