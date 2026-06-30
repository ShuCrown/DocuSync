import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isPake = mode === 'pake'

  return {
    // Use relative paths for Pake/Tauri local file loading (file:// protocol)
    base: isPake ? './' : '/',
    plugins: [react(), tailwindcss()],
    build: {
      // Raise warning threshold — large libraries (pdfjs, xlsx) exceed the default 500 kB
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        input: isPake ? 'index.pake.html' : 'index.html',
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
  }
})
