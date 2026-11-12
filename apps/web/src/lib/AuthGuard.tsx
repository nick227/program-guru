import { useEffect } from 'react'
import { useOnline } from './useOnline'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError, useCurrentUser } from '@project/sdk'
import { Page } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
export function AuthGuard() {
  const me = useCurrentUser()
  const online = useOnline()
  const location = useLocation()
  // Service-worker navigations can report navigator.onLine=true while API fetches fail.
  // Treat a transport failure as recoverable connectivity loss, not a signed-out session.
  const networkFetchFailed = me.error instanceof TypeError &&
    /failed to fetch|networkerror|load failed/i.test(me.error.message)
  const connectionUnavailable = !online || networkFetchFailed
  // An installed PWA may receive no online event when its service worker serves
  // a navigation. Retry the failed auth fetch until connectivity is restored.
  useEffect(() => {
    if (me.data || !networkFetchFailed) return
    const retry = window.setInterval(() => { void me.refetch() }, 3_000)
    return () => window.clearInterval(retry)
  }, [me.data, networkFetchFailed, me.refetch])
  if (!me.data && connectionUnavailable)
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
