import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Capacitor } from '@capacitor/core'
import './startup.js'

document.documentElement.classList.toggle('bee-native', Capacitor.isNativePlatform())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
