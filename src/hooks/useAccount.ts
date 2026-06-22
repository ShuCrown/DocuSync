import { useState, useCallback } from 'react'
import * as api from '../lib/api'

export function useAccount() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    try {
      const info = await api.getAccountInfo()
      setEmail(info.email)
    } catch (err) {
      console.error('Failed to check account status:', err)
    }
  }, [])

  const bindEmail = useCallback(async (emailAddr: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.bindEmail(emailAddr)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送验证码失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const verifyBind = useCallback(async (emailAddr: string, code: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.verifyBind(emailAddr, code)
      setEmail(result.email)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '验证失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const sendRecoverCode = useCallback(async (emailAddr: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.sendRecoverCode(emailAddr)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送验证码失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const recoverAccount = useCallback(async (emailAddr: string, code: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.recoverAccount(emailAddr, code)
      setEmail(emailAddr)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : '恢复失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const unbindEmail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await api.unbindEmail()
      setEmail(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '解绑失败'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    email,
    loading,
    error,
    checkStatus,
    bindEmail,
    verifyBind,
    sendRecoverCode,
    recoverAccount,
    unbindEmail,
  }
}
