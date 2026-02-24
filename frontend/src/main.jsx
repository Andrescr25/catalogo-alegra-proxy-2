import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Register Service Worker provided by vite-plugin-pwa
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Only register on production or if explictly testing PWA locally
    // VitePWA handles the registration script automatically
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
