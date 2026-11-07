import { Link, useNavigate } from 'react-router-dom'
import {
  useCurrentUser,
  useLogout,
  useUnreadNotificationCount,
} from '@project/sdk'
import { Panel, Stack } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage } from '@/components/ui/Feedback'
import { UnreadDot } from '@/components/UnreadDot'
import { linkButton } from '@/components/Navigation'
import { toggleTheme } from '@/lib/theme'

export function AccountMenu() {
  const me = useCurrentUser()
  const unread = useUnreadNotificationCount()
  const logout = useLogout()
  const navigate = useNavigate()
  const profile = me.data!.data.profile
  const count = unread.data?.count ?? 0
  return (
    <details className="relative">
      <summary
        className="relative flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-3"
        aria-label="Account"
      >
        <Avatar src={profile.avatarUrl} name={profile.displayName} size="sm" />
        <span className="max-w-[8rem] truncate text-sm">
          {profile.displayName}
        </span>
        <UnreadDot count={count} />
      </summary>
      <Panel className="absolute right-0 z-20 mt-2 w-60 shadow-lg">
        <Stack>
          <Link to={`/${profile.handle}`} className={linkButton}>
            Profile
          </Link>
          <Link to="/library" className={linkButton}>
            My Programs
          </Link>
          <Link to="/media" className={linkButton}>
            My Media
          </Link>
          <Link to="/notifications" className={linkButton}>
            Notifications
            {count > 0 ? ` (${count})` : ''}
          </Link>
          <Link to="/settings" className={linkButton}>
            Settings
          </Link>
          <Button variant="ghost" onClick={toggleTheme}>
            Change theme
          </Button>
          <Button
            variant="outline"
            loading={logout.isPending}
            onClick={async () => {
              try {
                await logout.mutateAsync()
                navigate('/login', { replace: true })
              } catch {
                /* shown below */
              }
            }}
          >
            Sign out
          </Button>
          <ErrorMessage error={logout.error} />
        </Stack>
      </Panel>
    </details>
  )
}
