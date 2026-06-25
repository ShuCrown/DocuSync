import { useState, useRef, useEffect } from 'react'
import { X, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, ToggleLeft, ToggleRight, Pencil } from 'lucide-react'
import { ServiceIcon } from './SelectionToolbar'
import type { AIService } from '../hooks/useAIServices'

interface AISettingsPanelProps {
  services: AIService[]
  onAdd: (name: string, url: string, iconUrl?: string) => void
  onRemove: (id: string) => void
  onMove: (id: string, direction: 'up' | 'down') => void
  onToggle: (id: string) => void
  onUpdate: (id: string, patch: Partial<AIService>) => void
  onReset: () => void
  onClose: () => void
}

export function AISettingsPanel({
  services,
  onAdd,
  onRemove,
  onMove,
  onToggle,
  onUpdate,
  onReset,
  onClose,
}: AISettingsPanelProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [iconUrl, setIconUrl] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editIconUrl, setEditIconUrl] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on click outside — use mouseup (fires after mousedown) to avoid
  // conflicting with focus/selection inside the panel inputs.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mouseup', handler)
    return () => document.removeEventListener('mouseup', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAdd = () => {
    if (!name.trim() || !url.trim()) return
    let finalUrl = url.trim()
    if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl
    onAdd(name.trim(), finalUrl, iconUrl.trim() || undefined)
    setName('')
    setUrl('')
    setIconUrl('')
    setShowAdd(false)
  }

  const startEdit = (s: AIService) => {
    setEditingId(s.id)
    setEditName(s.name)
    setEditUrl(s.url)
    setEditIconUrl(s.iconUrl)
  }

  const saveEdit = () => {
    if (!editingId || !editName.trim() || !editUrl.trim()) return
    let finalUrl = editUrl.trim()
    if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl
    onUpdate(editingId, {
      name: editName.trim(),
      url: finalUrl,
      iconUrl: editIconUrl.trim(),
    })
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-sm bg-surface-card rounded-xl border border-border shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col max-h-[70vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-alt/50 shrink-0">
          <span className="text-sm font-medium text-text">AI 问答服务管理</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-text-secondary hover:text-text rounded-md transition-colors"
              title="恢复默认"
            >
              <RotateCcw className="w-3 h-3" />
              恢复默认
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Service list */}
        <div className="overflow-y-auto flex-1 divide-y divide-border">
          {services.map((s, i) => editingId === s.id ? (
            /* Inline edit form */
            <div key={s.id} className="px-3 py-2.5 space-y-2 bg-surface-alt/30">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="名称"
                className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
              />
              <input
                type="text"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="网址"
                className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
              />
              <input
                type="text"
                value={editIconUrl}
                onChange={(e) => setEditIconUrl(e.target.value)}
                placeholder="图标 URL（可选）"
                className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={cancelEdit}
                  className="flex-1 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={saveEdit}
                  disabled={!editName.trim() || !editUrl.trim()}
                  className="flex-1 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          ) : (
            /* Normal display row */
            <div
              key={s.id}
              className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
                s.enabled ? '' : 'opacity-50'
              }`}
            >
              <ServiceIcon service={s} className="w-5 h-5 shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm text-text truncate">{s.name}</p>
                <p className="text-[11px] text-text-secondary truncate">{s.url}</p>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => onToggle(s.id)}
                  className="p-1 rounded text-text-secondary hover:text-text transition-colors"
                  title={s.enabled ? '禁用' : '启用'}
                >
                  {s.enabled ? (
                    <ToggleRight className="w-4 h-4 text-success" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => startEdit(s)}
                  className="p-1 rounded text-text-secondary hover:text-text transition-colors"
                  title="编辑"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onMove(s.id, 'up')}
                  disabled={i === 0}
                  className="p-1 rounded text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="上移"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onMove(s.id, 'down')}
                  disabled={i === services.length - 1}
                  className="p-1 rounded text-text-secondary hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="下移"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onRemove(s.id)}
                  className="p-1 rounded text-text-secondary hover:text-error transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add section */}
        {showAdd ? (
          <div className="border-t border-border p-3 space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名称（如 ChatGPT）"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
            />
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="网址（如 chat.openai.com）"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
            />
            <input
              type="text"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="图标 URL（可选）"
              className="w-full px-2.5 py-1.5 text-sm bg-surface border border-border rounded-md text-text placeholder:text-text-secondary/50 outline-none focus:border-primary transition-colors"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-1.5 text-sm text-text-secondary border border-border rounded-md hover:bg-surface-alt transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdd}
                disabled={!name.trim() || !url.trim()}
                className="flex-1 py-1.5 text-sm text-white bg-primary rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-border p-2">
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-text-secondary hover:text-text rounded-md hover:bg-surface-alt transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加服务
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
