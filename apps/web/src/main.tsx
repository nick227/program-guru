import './lib/theme'
import { startPwa } from './lib/pwa'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { createApiClient } from '@project/sdk'
import { queryClient } from './lib/queryClient'
import { App } from './App'
import { AppToaster } from './components/ui/AppToaster'
import './styles/index.css'
createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
})
document.documentElement.dataset.appBuild = import.meta.env.VITE_APP_BUILD
startPwa()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <AppToaster />
    </QueryClientProvider>
  </React.StrictMode>,
)
