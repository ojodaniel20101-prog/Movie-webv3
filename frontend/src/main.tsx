import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initSubtitleStyles } from '@/services/subtitles'

// Initialize subtitle styles from LocalStorage on app boot
initSubtitleStyles()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
