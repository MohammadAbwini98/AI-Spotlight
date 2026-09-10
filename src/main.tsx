import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { resolveTheme } from './design/theme'
import './design/tokens.css'
import './design/global.css'

// Type augmentation for window.electronAPI
declare global {
  interface Window {
    electronAPI: import('../electron/preload/index').ElectronAPI
  }
}

// Apply the OS preference before React paints to avoid a light-theme flash.
document.documentElement.dataset.theme = resolveTheme(
  'system',
  window.matchMedia('(prefers-color-scheme: dark)').matches
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
