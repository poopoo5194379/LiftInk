import './assets/main.css'
import './assets/typography.css'
import './assets/materials.css'
import './assets/refinements.css'
import './assets/views.css'
import './assets/workspaces.css'
import './assets/pen-poc.css'
import './assets/editor-live.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
