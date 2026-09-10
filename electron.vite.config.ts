import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: {
          index: 'electron/main/index.ts',
          'sync-worker': 'electron/main/indexer/sync-worker.ts'
        }
      }
    },
    resolve: {
      alias: {
        '@main': resolve('electron/main'),
        '@shared': resolve('electron/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: 'electron/preload/index.ts'
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('electron/shared')
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: 'index.html'
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src'),
        '@shared': resolve('electron/shared')
      }
    },
    plugins: [react()],
    css: {
      devSourcemap: true
    }
  }
})
