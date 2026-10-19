import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Bundled into the main bundle (ESM-only packages); they are devDependencies, so not shipped twice.
const bundled = ['chokidar', 'electron-store', 'zod']

export default defineConfig({
  main: {
    build: {
      externalizeDeps: { exclude: bundled }
    },
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: { output: { format: 'cjs' } }
    },
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer') }
    }
  }
})
