import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { cp, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

const excalidrawFonts = fileURLToPath(
  new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url),
)

function localExcalidrawFonts(): Plugin {
  let outputDirectory = ''
  return {
    name: 'non-local-excalidraw-fonts',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use('/excalidraw-assets/fonts', (request, response, next) => {
        const requested = decodeURIComponent((request.url ?? '').split('?')[0]).replace(/^\/+/, '')
        const target = resolve(excalidrawFonts, requested)
        const outside = relative(excalidrawFonts, target)
        if (outside.startsWith('..')) {
          next()
          return
        }
        void stat(target)
          .then((metadata) => {
            if (!metadata.isFile()) throw new Error('Not a font file')
            return readFile(target)
          })
          .then((content) => {
            response.setHeader('Content-Type', 'font/woff2')
            response.end(content)
          })
          .catch(() => next())
      })
    },
    async writeBundle() {
      await cp(excalidrawFonts, join(outputDirectory, 'excalidraw-assets/fonts'), {
        recursive: true,
        // Ignore iCloud conflict copies that can appear beside dependency assets.
        filter: (source) => !source.endsWith(' 2.woff2'),
      })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), localExcalidrawFonts()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'tunnel-rat': fileURLToPath(
        new URL('./src/shared/vendor/tunnel-rat.tsx', import.meta.url),
      ),
    },
    dedupe: ['react', 'react-dom', 'zustand'],
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/dist-electron/**', '**/release/**'] },
  },
  clearScreen: false,
})
