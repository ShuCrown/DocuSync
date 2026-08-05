import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Raise warning threshold — large libraries (pdfjs, xlsx) exceed the default 500 kB
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split large vendor libraries into dedicated chunks for better caching.
        // React changes rarely; pdfjs/xlsx are only needed for specific file types.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('/react/')) {
              return 'react-vendor'
            }
            if (id.includes('pdfjs-dist')) {
              return 'pdf-vendor'
            }
            if (id.includes('/xlsx')) {
              return 'xlsx-vendor'
            }
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'https://docusync.pages.dev',
    },
    // Tauri expects a fixed port, fail if that port is not available
    port: 1420,
    strictPort: false,
    // Tauri environment variables
    ...(host ? { host } : {}),
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    // Ignore watching src-tauri to avoid Rust recompilation loops
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // Env prefix for Tauri
  envPrefix: ['VITE_', 'TAURI_'],
})
