import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { AuthGate } from './auth/AuthGate'
import './app/styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
