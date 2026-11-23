import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import App from './App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root 요소가 없습니다.')

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
