import { useEffect, useRef } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useCurrentUser, useLogout, useUnreadNotificationCount } from '@project/sdk'
import { Panel, Stack } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage } from '@/components/ui/Feedback'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { linkButton } from '@/components/shared/Navigation'
import { toggleTheme } from '@/lib/theme'
import { buildProfileUrl } from '@/lib/urls'

export function AccountMenu() {
  const me = useCurrentUser()
  const unread = useUnreadNotificationCount()
  const logout = useLogout()
  const navigate = useNavigate()
  const detailsRef = useRef<HTMLDetailsElement>(null)

  const profile = me.data!.data.profile
  const count = unread.data?.count ?? 0

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && detailsRef.current?.open) {
        detailsRef.current.open = false
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (
        detailsRef.current?.open &&
        !detailsRef.current.contains(event.target as Node)
      ) {
        detailsRef.current.open = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [])

  return (
    <div className="relative flex items-center gap-2">
      {/* The bell is a plain link to the Notification Center (12-SOCIAL); the badge is the unread count. */}
      <NavLink
        to="/notifications"
        aria-label="Notifications"
        className={({ isActive }) =>
          `relative flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 transition-colors hover:bg-surface-muted ${
            isActive ? 'border-accent bg-accent/10 text-accent' : 'bg-surface'
          }`
        }
      >
        <Bell size={18} aria-hidden />
        <UnreadDot count={count} />
      </NavLink>

      <details ref={detailsRef} className="relative">
        <summary
          className="relative flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-full border bg-surface p-1 sm:min-w-0 sm:justify-start sm:py-1 sm:pl-1 sm:pr-3"
          aria-label="Account"
        >
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="sm"
          />
          <span className="hidden truncate text-sm sm:inline sm:max-w-[8rem]">
            {profile.displayName}
          </span>
          <UnreadDot count={count} dotOnly />
        </summary>
        <Panel className="absolute right-0 z-20 mt-2 w-60 shadow-lg">
          <Stack>
            <Link to={buildProfileUrl(profile.handle)} className={linkButton}>
              Profile
            </Link>
            <Link to="/settings" className={linkButton}>
              Settings
            </Link>
            {me.data!.data.role === 'ADMIN' && (
              <Link to="/admin" className={linkButton}>
                Admin
              </Link>
            )}
            <Button variant="outline" onClick={toggleTheme}>
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
    </div>
  )
}
