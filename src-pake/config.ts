export type RunMode = 'cloud' | 'private'

export interface PakeConfig {
  mode: RunMode
  storage: { backend: 'cloud' | 'local'; localDir: string }
  features: { sharing: boolean; account: boolean; crossDevice: boolean }
}

const PROFILES: Record<RunMode, PakeConfig> = {
  cloud: {
    mode: 'cloud',
    storage: { backend: 'cloud', localDir: '' },
    features: { sharing: true, account: true, crossDevice: true },
  },
  private: {
    mode: 'private',
    storage: { backend: 'local', localDir: '~/DocuSync' },
    features: { sharing: false, account: false, crossDevice: false },
  },
}

function loadConfig(): PakeConfig {
  // 1. Check runtime injection (window.__DOCUSYNC_CONFIG__)
  const win = window as unknown as Record<string, unknown>
  const runtime = win.__DOCUSYNC_CONFIG__ as Partial<PakeConfig> | undefined
  if (runtime?.mode && runtime.mode in PROFILES) {
    return { ...PROFILES[runtime.mode], ...runtime }
  }

  // 2. Check build-time env
  const envMode = import.meta.env.VITE_MODE as RunMode | undefined
  if (envMode && envMode in PROFILES) {
    return PROFILES[envMode]
  }

  // 3. Default to cloud
  return PROFILES.cloud
}

export const config: PakeConfig = loadConfig()
