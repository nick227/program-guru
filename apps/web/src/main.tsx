import './lib/theme'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { createApiClient } from '@project/sdk'
import { queryClient } from './lib/queryClient'
import { App } from './App'
import './index.css'
createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3001',
})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  </React.StrictMode>,
)
