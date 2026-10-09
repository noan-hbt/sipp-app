import { hashKey, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CrashScreen } from './components/CrashScreen'
import { getSessionId, onSessionChange } from './lib/api'
import { initTelemetry } from './lib/telemetry'
import './styles/global.css'

initTelemetry()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: true, networkMode: 'offlineFirst', queryKeyHashFn: (key) => hashKey([getSessionId(), ...key]) } },
})
onSessionChange(() => {
  void queryClient.cancelQueries()
  queryClient.clear()
})

function SessionApp() {
  const session = useSyncExternalStore(onSessionChange, getSessionId)
  return <App key={session} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <CrashScreen>
            <SessionApp />
          </CrashScreen>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
)
