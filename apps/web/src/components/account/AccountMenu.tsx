import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import {
  useCurrentUser,
  useLogout,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@project/sdk'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { UnreadDot } from '@/components/shared/UnreadDot'
import { NotificationRow } from '@/components/account/NotificationRow'
import { linkButton } from '@/components/shared/Navigation'
import { toggleTheme } from '@/lib/theme'
import { buildProfileUrl } from '@/lib/urls'

export function AccountMenu() {
  const me = useCurrentUser()
  const unread = useUnreadNotificationCount()
  const logout = useLogout()
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const recent = useNotifications({ limit: 8, enabled: panelOpen })
  const mark = useMarkNotificationsRead()

  const profile = me.data!.data.profile
  const timezone = me.data!.data.preferences.timezone
  const count = unread.data?.count ?? 0
  const rows = recent.data?.pages.flatMap((p) => p.data) ?? []
  const hasUnread = count > 0 || rows.some((n) => !n.readAt)

  useEffect(() => {
    if (!panelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelOpen(false)
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [panelOpen])

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
        onClick={() => {
          if (detailsRef.current) detailsRef.current.open = false
          setPanelOpen((prev) => !prev)
        }}
        className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full border bg-surface px-3 transition-colors hover:bg-surface-muted"
      >
        <Bell size={18} aria-hidden />
        <UnreadDot count={count} />
      </button>

      {panelOpen && (
        <>
          <div
            aria-hidden
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-20 bg-black/30 sm:hidden"
          />
          <section
            role="dialog"
            aria-label="Recent notifications"
            className="fixed inset-x-0 bottom-0 z-30 flex max-h-[82vh] flex-col rounded-t-2xl border-t bg-surface shadow-lg sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(32rem,70vh)] sm:w-96 sm:rounded-xl sm:border"
          >
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-border sm:hidden" />
            <div className="sticky top-0 z-10 shrink-0 border-b bg-surface px-4 py-3">
              <Row className="justify-between gap-2">
                <Row className="min-w-0 gap-2">
                  <h2 className="text-base font-semibold">Notifications</h2>
                  <UnreadDot count={count} inline />
                </Row>
                <Row className="shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    className="px-2 text-xs"
                    disabled={!hasUnread || mark.isPending}
                    loading={mark.isPending}
                    onClick={() => mark.mutate({ all: true })}
                  >
                    Mark all read
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close notifications"
                    onClick={() => setPanelOpen(false)}
                  >
                    <X size={16} />
                  </Button>
                </Row>
              </Row>
            </div>
            <Stack className="gap-3 overflow-y-auto px-4 py-3">

              <ErrorMessage
                error={recent.error || mark.error}
                retry={() => void recent.refetch()}
              />

              {recent.isPending ? (
                <Loading />
              ) : rows.length === 0 ? (
                <Panel className="py-6 text-center">
                  <p className="text-sm text-muted">You are caught up.</p>
                </Panel>
              ) : (
                <Stack className="gap-2">
                  {rows.slice(0, 6).map((n) => (
                    <NotificationRow
                      key={n.id}
                      notification={n}
                      timezone={timezone}
                      compact
                      marking={mark.isPending}
                      onMarkRead={(id) => mark.mutate({ ids: [id] })}
                      onNavigate={() => setPanelOpen(false)}
                    />
                  ))}
                </Stack>
              )}

              <Row className="justify-between border-t pt-2">
                <Link
                  to="/notifications"
                  onClick={() => setPanelOpen(false)}
                  className={linkButton}
                >
                  Open Inbox
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setPanelOpen(false)}
                  className="text-xs text-muted underline hover:text-text"
                >
                  Reminder settings
                </Link>
              </Row>
            </Stack>
          </section>
        </>
      )}

      <details
        ref={detailsRef}
        className="relative"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open) {
            setPanelOpen(false)
          }
        }}
      >
        <summary
          className="relative flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border bg-surface py-1 pl-1 pr-2 sm:pr-3"
          aria-label="Account"
        >
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="sm"
          />
          <span className="max-w-12 truncate text-sm sm:max-w-[8rem]">
            {profile.displayName}
          </span>
          <UnreadDot count={count} dotOnly />
        </summary>
        <Panel className="absolute right-0 z-20 mt-2 w-60 shadow-lg">
          <Stack>
            <Link to={buildProfileUrl(profile.handle)} className={linkButton}>
              Profile
            </Link>
            <Link to="/studio" className={linkButton}>
              Creator Studio
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
            <Link to="/achievements" className={linkButton}>
              Achievements
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
