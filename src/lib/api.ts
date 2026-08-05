import { isLocalMode } from './storage-mode'
import * as local from './api-local'
import * as remote from './api-remote'

export type { DocumentRecord, ShareRecord, ShareInfo } from './api-types'

// Device
export async function registerDevice() {
  if (isLocalMode()) return local.registerDevice()
  return remote.registerDevice()
}

// Documents
export async function uploadDocument(file: File, extractedText?: string) {
  if (isLocalMode()) return local.uploadDocument(file, extractedText)
  return remote.uploadDocument(file, extractedText)
}

export async function listDocuments() {
  if (isLocalMode()) return local.listDocuments()
  return remote.listDocuments()
}

export async function deleteDocument(docId: string) {
  if (isLocalMode()) return local.deleteDocument(docId)
  return remote.deleteDocument(docId)
}

export async function downloadDocument(
  docId: string,
  onProgress?: (loaded: number, total: number) => void,
  expectedSize?: number,
) {
  if (isLocalMode()) return local.downloadDocument(docId, onProgress, expectedSize)
  return remote.downloadDocument(docId, onProgress, expectedSize)
}

export async function getDocumentText(docId: string) {
  if (isLocalMode()) return local.getDocumentText(docId)
  return remote.getDocumentText(docId)
}

export async function summarizeDocument(docId: string, text?: string) {
  if (isLocalMode()) return local.summarizeDocument(docId, text)
  return remote.summarizeDocument(docId, text)
}

export async function getSummary(docId: string) {
  if (isLocalMode()) return local.getSummary(docId)
  return remote.getSummary(docId)
}

// Account
export async function bindEmail(email: string) {
  if (isLocalMode()) return local.bindEmail(email)
  return remote.bindEmail(email)
}

export async function verifyBind(email: string, code: string) {
  if (isLocalMode()) return local.verifyBind(email, code)
  return remote.verifyBind(email, code)
}

export async function sendRecoverCode(email: string) {
  if (isLocalMode()) return local.sendRecoverCode(email)
  return remote.sendRecoverCode(email)
}

export async function recoverAccount(email: string, code: string) {
  if (isLocalMode()) return local.recoverAccount(email, code)
  return remote.recoverAccount(email, code)
}

export async function getAccountInfo() {
  if (isLocalMode()) return local.getAccountInfo()
  return remote.getAccountInfo()
}

export async function unbindEmail() {
  if (isLocalMode()) return local.unbindEmail()
  return remote.unbindEmail()
}

// Shares
export async function createShare(docId: string, expiresIn: string) {
  if (isLocalMode()) return local.createShare(docId, expiresIn)
  return remote.createShare(docId, expiresIn)
}

export async function listShares(docId: string) {
  if (isLocalMode()) return local.listShares(docId)
  return remote.listShares(docId)
}

export async function deleteShare(shareId: string) {
  if (isLocalMode()) return local.deleteShare(shareId)
  return remote.deleteShare(shareId)
}

export async function getShareInfo(token: string) {
  if (isLocalMode()) return local.getShareInfo(token)
  return remote.getShareInfo(token)
}

export async function getShareContent(token: string) {
  if (isLocalMode()) return local.getShareContent(token)
  return remote.getShareContent(token)
}
