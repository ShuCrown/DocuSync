import { useState, useEffect } from 'react'
import { X, Mail, Shield, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface AccountPanelProps {
  open: boolean
  onClose: () => void
  email: string | null
  loading: boolean
  error: string | null
  onBind: (email: string) => Promise<{ message: string; cooldown?: number }>
  onVerify: (email: string, code: string) => Promise<{ success: true; email: string }>
  onSendRecoverCode: (email: string) => Promise<{ message: string; cooldown?: number }>
  onRecover: (email: string, code: string) => Promise<{ devices: string[]; documents: unknown[] }>
  onUnbind: () => Promise<void>
}

type Mode = 'status' | 'bind' | 'bind-verify' | 'recover' | 'recover-verify'

export function AccountPanel({
  open,
  onClose,
  email,
  loading,
  error,
  onBind,
  onVerify,
  onSendRecoverCode,
  onRecover,
  onUnbind,
}: AccountPanelProps) {
  const [mode, setMode] = useState<Mode>('status')
  const [inputEmail, setInputEmail] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [success, setSuccess] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setMode(email ? 'status' : 'bind')
      setInputEmail('')
      setCode('')
      setCooldown(0)
      setSuccess(null)
      setLocalError(null)
    }
  }, [open, email])

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((v) => {
        if (v <= 1) { clearInterval(timer); return 0 }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  if (!open) return null

  const handleBindSubmit = async () => {
    if (!inputEmail.trim()) return
    setLocalError(null)
    setSuccess(null)
    try {
      const result = await onBind(inputEmail)
      setSuccess(result.message)
      if (result.cooldown) setCooldown(result.cooldown)
      setMode('bind-verify')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '发送失败')
    }
  }

  const handleVerifySubmit = async () => {
    if (!code.trim()) return
    setLocalError(null)
    setSuccess(null)
    try {
      await onVerify(inputEmail, code)
      setSuccess('邮箱绑定成功')
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '验证失败')
    }
  }

  const handleRecoverSend = async () => {
    if (!inputEmail.trim()) return
    setLocalError(null)
    setSuccess(null)
    try {
      const result = await onSendRecoverCode(inputEmail)
      setSuccess(result.message)
      if (result.cooldown) setCooldown(result.cooldown)
      setMode('recover-verify')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '发送失败')
    }
  }

  const handleRecoverSubmit = async () => {
    if (!code.trim()) return
    setLocalError(null)
    setSuccess(null)
    try {
      const result = await onRecover(inputEmail, code)
      setSuccess(`已恢复 ${result.documents.length} 个文档`)
      setTimeout(() => onClose(), 2000)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '恢复失败')
    }
  }

  const handleUnbind = async () => {
    setLocalError(null)
    try {
      await onUnbind()
      setSuccess('已解绑邮箱')
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '解绑失败')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-card border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.12)] w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-4.5 h-4.5 text-primary" />
            <span className="text-sm font-medium text-text">账户管理</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-alt transition-colors text-text-secondary">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Error / Success messages */}
          {(localError || error) && (
            <div className="flex items-start gap-2 p-3 bg-error/5 border border-error/10 rounded-md text-sm text-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{localError || error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-100 rounded-md text-sm text-green-700">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Mode: status (already bound) */}
          {mode === 'status' && email && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-md">
                <Mail className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-xs text-text-secondary">已绑定邮箱</p>
                  <p className="text-sm font-medium text-text">{email}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('recover'); setInputEmail(''); setCode(''); setSuccess(null); setLocalError(null) }}
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md hover:bg-surface-alt transition-colors text-text"
                >
                  恢复文档
                </button>
                <button
                  onClick={handleUnbind}
                  disabled={loading}
                  className="flex-1 px-3 py-2 text-sm border border-error/30 text-error rounded-md hover:bg-error/5 transition-colors disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '解绑邮箱'}
                </button>
              </div>
            </div>
          )}

          {/* Mode: bind (enter email) */}
          {mode === 'bind' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">绑定邮箱后可跨设备恢复文档历史</p>
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleBindSubmit()}
              />
              <button
                onClick={handleBindSubmit}
                disabled={loading || !inputEmail.trim()}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                发送验证码
              </button>
              <button
                onClick={() => { setMode('recover'); setInputEmail(''); setSuccess(null); setLocalError(null) }}
                className="w-full text-sm text-text-secondary hover:text-primary transition-colors"
              >
                已有绑定？恢复文档
              </button>
            </div>
          )}

          {/* Mode: bind-verify (enter code) */}
          {mode === 'bind-verify' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                验证码已发送至 <span className="font-medium text-text">{inputEmail}</span>
              </p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入 6 位验证码"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary tracking-widest text-center font-mono"
                maxLength={6}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifySubmit()}
              />
              <button
                onClick={handleVerifySubmit}
                disabled={loading || code.length !== 6}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                确认绑定
              </button>
              <div className="flex justify-between">
                <button
                  onClick={() => { setMode('bind'); setCode(''); setSuccess(null); setLocalError(null) }}
                  className="text-sm text-text-secondary hover:text-primary transition-colors"
                >
                  更换邮箱
                </button>
                <button
                  onClick={handleBindSubmit}
                  disabled={loading || cooldown > 0}
                  className="text-sm text-text-secondary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {cooldown > 0 ? `${cooldown}s 后重发` : '重新发送'}
                </button>
              </div>
            </div>
          )}

          {/* Mode: recover (enter email) */}
          {mode === 'recover' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">输入已绑定的邮箱，我们将发送验证码</p>
              <input
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="请输入邮箱地址"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                onKeyDown={(e) => e.key === 'Enter' && handleRecoverSend()}
              />
              <button
                onClick={handleRecoverSend}
                disabled={loading || !inputEmail.trim()}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                发送验证码
              </button>
              <button
                onClick={() => { setMode(email ? 'status' : 'bind'); setInputEmail(''); setSuccess(null); setLocalError(null) }}
                className="w-full text-sm text-text-secondary hover:text-primary transition-colors"
              >
                返回
              </button>
            </div>
          )}

          {/* Mode: recover-verify (enter code) */}
          {mode === 'recover-verify' && (
            <div className="space-y-3">
              <p className="text-sm text-text-secondary">
                验证码已发送至 <span className="font-medium text-text">{inputEmail}</span>
              </p>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="请输入 6 位验证码"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary tracking-widest text-center font-mono"
                maxLength={6}
                onKeyDown={(e) => e.key === 'Enter' && handleRecoverSubmit()}
              />
              <button
                onClick={handleRecoverSubmit}
                disabled={loading || code.length !== 6}
                className="w-full px-3 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                恢复文档
              </button>
              <div className="flex justify-between">
                <button
                  onClick={() => { setMode('recover'); setCode(''); setSuccess(null); setLocalError(null) }}
                  className="text-sm text-text-secondary hover:text-primary transition-colors"
                >
                  更换邮箱
                </button>
                <button
                  onClick={handleRecoverSend}
                  disabled={loading || cooldown > 0}
                  className="text-sm text-text-secondary hover:text-primary transition-colors disabled:opacity-50"
                >
                  {cooldown > 0 ? `${cooldown}s 后重发` : '重新发送'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
