import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initSubtitleStyles } from '@/services/subtitles'
import { registerServiceWorker, requestNotificationPermission } from '@/services/notifications'

// Initialize subtitle styles from LocalStorage on app boot
initSubtitleStyles()

// Register service worker for push notifications
registerServiceWorker().then(() => {
  // After SW is ready, check if we should request notification permission
  // Only prompt if permission is 'default' (never asked)
  if ('Notification' in window && Notification.permission === 'default') {
    // Delay the prompt slightly so it doesn't interrupt app load
    setTimeout(() => {
      requestNotificationPermission();
    }, 5000);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
