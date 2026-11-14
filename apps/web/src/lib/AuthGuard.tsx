import { useOnline } from './useOnline'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError, useCurrentUser } from '@project/sdk'
import { Page } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
export function AuthGuard() {
  const me = useCurrentUser()
  const online = useOnline()
  const location = useLocation()
  // A service-worker-controlled offline page may still report navigator.onLine=true.
  // Network failures (not HTTP ApiErrors) must show the reconnect fallback too.
  if (!me.data && (!online || (me.isError && !(me.error instanceof ApiError))))
    return (
      <Page>
        <h1>Connect to load your account</h1>
        <p>Your account data needs a connection. Your session has not been signed out.</p>
        <button type="button" className="text-accent underline" onClick={() => void me.refetch()}>Retry</button>
      </Page>
    )
  if (me.isPending)
    return (
      <Page>
        <Loading />
      </Page>
    )
  if (me.error instanceof ApiError && me.error.status === 401)
    return (
      <Navigate
        replace
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      />
    )
  if (me.error && !me.data)
    return (
      <Page>
        <ErrorMessage error={me.error} retry={() => void me.refetch()} />
      </Page>
    )
  return <Outlet />
}
