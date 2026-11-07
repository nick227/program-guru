import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { ApiError, useCurrentUser } from '@project/sdk'
import { Page } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
export function AuthGuard() {
  const me = useCurrentUser()
  const location = useLocation()
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
  if (me.error)
    return (
      <Page>
        <ErrorMessage error={me.error} retry={() => void me.refetch()} />
      </Page>
    )
  return <Outlet />
}
