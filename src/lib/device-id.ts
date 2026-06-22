const STORAGE_KEY = 'docusync_device_id'

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  const bytes = crypto.getRandomValues(new Uint8Array(21))
  let id = ''
  for (let i = 0; i < bytes.length; i++) {
    id += chars[bytes[i] % chars.length]
  }
  return id
}

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = generateId()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}
