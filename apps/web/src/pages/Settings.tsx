import { InstallApp } from '@/components/account/PwaControls'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useApproveFollowRequest,
  useCurrentUser,
  useDeclineFollowRequest,
  useMyFollowRequests,
  useMyGroups,
  useUpdatePreferences,
} from '@project/sdk'
import { toast } from 'sonner'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/shared/Navigation'
import { UpcomingRemindersPanel } from '@/components/account/UpcomingRemindersPanel'
import {
  formatLocalTime,
  getAvailableTimezones,
  isValidReminderTime,
  isValidTimezone,
  localNowTime,
} from '@/lib/notifications'
import { toggleTheme } from '@/lib/theme'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildGroupUrl, buildProfileUrl } from '@/lib/urls'

const DEFAULT_NOTIF_PREFS = {
  inAppReminders: true,
  dailyEmail: false,
  dailyReminderTime: '08:00',
  groupActivity: true,
  followRequests: true,
  mutedGroupIds: [] as string[],
}

export function SettingsPage() {
  useDocumentTitle('Settings')
  const me = useCurrentUser()
  const updatePrefs = useUpdatePreferences()
  const groups = useMyGroups()
  const followReqs = useMyFollowRequests()
  const approveReq = useApproveFollowRequest()
  const declineReq = useDeclineFollowRequest()
  const online = useOnline()

  const user = me.data!.data
  const profile = user.profile
  const serverPrefs = user.preferences
  const serverNotifs = serverPrefs.notifications ?? DEFAULT_NOTIF_PREFS

  const [timezone, setTimezone] = useState(
    serverPrefs.timezone || 'America/Chicago',
  )
  const [inAppReminders, setInAppReminders] = useState(
    serverNotifs.inAppReminders ?? true,
  )
  const [dailyEmail, setDailyEmail] = useState(serverNotifs.dailyEmail ?? false)
  const [dailyReminderTime, setDailyReminderTime] = useState(
    serverNotifs.dailyReminderTime || '08:00',
  )
  const [groupActivity, setGroupActivity] = useState(
    serverNotifs.groupActivity ?? true,
  )
  const [followRequests, setFollowRequests] = useState(
    serverNotifs.followRequests ?? true,
  )
  const [mutedGroupIds, setMutedGroupIds] = useState<string[]>(
    serverNotifs.mutedGroupIds ?? [],
  )
  const [savedNotice, setSavedNotice] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    setTimezone(serverPrefs.timezone || 'America/Chicago')
    setInAppReminders(serverNotifs.inAppReminders ?? true)
    setDailyEmail(serverNotifs.dailyEmail ?? false)
    setDailyReminderTime(serverNotifs.dailyReminderTime || '08:00')
    setGroupActivity(serverNotifs.groupActivity ?? true)
    setFollowRequests(serverNotifs.followRequests ?? true)
    setMutedGroupIds(serverNotifs.mutedGroupIds ?? [])
  }, [
    serverPrefs.timezone,
    serverNotifs.inAppReminders,
    serverNotifs.dailyEmail,
    serverNotifs.dailyReminderTime,
    serverNotifs.groupActivity,
    serverNotifs.followRequests,
    serverNotifs.mutedGroupIds,
  ])

  const timezones = getAvailableTimezones(timezone)
  const groupRows = groups.data?.pages.flatMap((p) => p.data) ?? []
  const pendingFollowRequests = (
    followReqs.data?.pages.flatMap((p) => p.data) ?? []
  ).filter((r) => r.status === 'PENDING')

  const toggleMutedGroup = (groupId: string) => {
    setSavedNotice(false)
    setMutedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    )
  }

  const handleSavePreferences = async () => {
    setValidationError(null)
    setSavedNotice(false)
    if (!isValidTimezone(timezone)) {
      setValidationError('Choose a valid IANA timezone.')
      return
    }
    const normalizedTime = dailyReminderTime.slice(0, 5)
    if (!isValidReminderTime(normalizedTime)) {
      setValidationError('Enter a valid 24-hour reminder time (HH:MM).')
      return
    }
    try {
      await updatePrefs.mutateAsync({
        timezone,
        notifications: {
          inAppReminders,
          dailyEmail,
          dailyReminderTime: normalizedTime,
          groupActivity,
          followRequests,
          mutedGroupIds,
        },
      })
      setSavedNotice(true)
      toast.success('Preferences saved')
    } catch {
      /* error shown via ErrorMessage */
    }
  }

  return (
    <Page className="page--content">
      <Stage>
        <Row className="justify-between">
          <Back to={buildProfileUrl(profile.handle)}>Profile</Back>
        </Row>
        <h1>Settings</h1>

        <Panel id="reminders">
          <Stack>
            <Row className="justify-between">
              <h2>Reminders &amp; Notifications</h2>
              {savedNotice && (
                <span role="status" className="text-xs font-medium text-success">
                  Preferences saved
                </span>
              )}
            </Row>
            <p className="text-sm text-muted">
              Configure how and when Activity reminders, daily summaries, and
              group updates reach you. Schedules and reminders follow your
              selected timezone.
            </p>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">Timezone</span>
              <select
                aria-label="Timezone"
                value={timezone}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setTimezone(e.target.value)
                }}
                className="min-h-11 w-full rounded-md border bg-surface px-3 py-2 text-base text-text focus:border-accent sm:text-sm"
              >
                {timezones.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replaceAll('_', ' ')} ({tz})
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-muted">
              Local time in {timezone.replaceAll('_', ' ')}:{' '}
              {formatLocalTime(localNowTime(timezone))}
            </p>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <span className="block font-medium">
                  In-app Activity reminders
                </span>
                <span className="block text-xs text-muted">
                  Show reminders in your Inbox and Calendar when scheduled
                  Activities are due.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="In-app Activity reminders"
                checked={inAppReminders}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setInAppReminders(e.target.checked)
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <span className="block font-medium">Daily reminder email</span>
                <span className="block text-xs text-muted">
                  Receive at most one email per day when you have planned
                  Activities.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Daily reminder email"
                checked={dailyEmail}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setDailyEmail(e.target.checked)
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-medium">
                Daily reminder time ({timezone.replaceAll('_', ' ')})
              </span>
              <Input
                type="time"
                aria-label="Daily reminder time"
                value={dailyReminderTime}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setDailyReminderTime(e.target.value)
                }}
              />
              <span className="block text-xs text-muted">
                Used for daily summaries and un-timed Activity reminders (
                {formatLocalTime(dailyReminderTime.slice(0, 5))}).
              </span>
            </label>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <span className="block font-medium">
                  Group activity notifications
                </span>
                <span className="block text-xs text-muted">
                  Notify when collaborators complete Activities, react, or share
                  media.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Group activity notifications"
                checked={groupActivity}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setGroupActivity(e.target.checked)
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <span className="block font-medium">
                  Follow request notifications
                </span>
                <span className="block text-xs text-muted">
                  Notify when someone requests to follow your profile or accepts
                  your request.
                </span>
              </div>
              <input
                type="checkbox"
                aria-label="Follow request notifications"
                checked={followRequests}
                disabled={!online || updatePrefs.isPending}
                onChange={(e) => {
                  setSavedNotice(false)
                  setFollowRequests(e.target.checked)
                }}
                className="h-5 w-5 accent-accent"
              />
            </label>

            {groupRows.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold">Group Mutes</h3>
                <p className="text-xs text-muted">
                  Mute individual groups without turning off all group
                  notifications.
                </p>
                <Stack className="gap-2">
                  {groupRows.map((g) => {
                    const muted = mutedGroupIds.includes(g.id)
                    const label = g.name || g.programTitle
                    return (
                      <div
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div>
                          <Link
                            to={buildGroupUrl(g.id)}
                            className="font-medium hover:underline"
                          >
                            {label}
                          </Link>
                          <p className="text-xs text-muted">
                            {g.programTitle} · {g.memberCount} members
                          </p>
                        </div>
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            aria-label={`Mute ${label}`}
                            checked={muted}
                            disabled={!online || updatePrefs.isPending}
                            onChange={() => toggleMutedGroup(g.id)}
                            className="h-4 w-4 accent-accent"
                          />
                          <span>Mute notifications</span>
                        </label>
                      </div>
                    )
                  })}
                </Stack>
              </div>
            )}

            <ErrorMessage error={validationError || updatePrefs.error} />

            <Row>
              <Button
                disabled={!online}
                loading={updatePrefs.isPending}
                onClick={() => void handleSavePreferences()}
              >
                Save preferences
              </Button>
            </Row>
          </Stack>
        </Panel>

        <UpcomingRemindersPanel compact />

        <Panel id="follow-requests">
          <Stack>
            <h2>Follow Requests</h2>
            <ErrorMessage
              error={
                followReqs.error || approveReq.error || declineReq.error
              }
              retry={() => void followReqs.refetch()}
            />
            {followReqs.isPending ? (
              <Loading />
            ) : pendingFollowRequests.length === 0 ? (
              <p className="text-sm text-muted">No pending follow requests.</p>
            ) : (
              <Stack className="gap-2">
                {pendingFollowRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <Link
                      to={buildProfileUrl(req.requester.handle)}
                      className="flex items-center gap-2"
                    >
                      <Avatar
                        src={req.requester.avatarUrl}
                        name={req.requester.displayName}
                        size="sm"
                      />
                      <div>
                        <p className="font-semibold">
                          {req.requester.displayName}
                        </p>
                        <p className="text-xs text-muted">
                          @{req.requester.handle}
                        </p>
                      </div>
                    </Link>
                    <Row className="gap-2">
                      <Button
                        disabled={!online || approveReq.isPending}
                        loading={approveReq.isPending}
                        onClick={() => approveReq.mutate(req.id)}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!online || declineReq.isPending}
                        loading={declineReq.isPending}
                        onClick={() => declineReq.mutate(req.id)}
                      >
                        Decline
                      </Button>
                    </Row>
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Panel>

        <Panel>
          <Stack>
            <h2>Account</h2>
            <p className="text-muted">
              Signed in as {user.email} · @{profile.handle}
            </p>
            <Row>
              <Link to={buildProfileUrl(profile.handle)} className={linkButton}>
                View profile
              </Link>
              <Link to="/achievements" className={linkButton}>
                My Achievements
              </Link>
            </Row>
          </Stack>
        </Panel>

        <Panel>
          <Stack>
            <h2>Appearance</h2>
            <Button variant="outline" onClick={toggleTheme}>
              Toggle light / dark
            </Button>
          </Stack>
        </Panel>

        <Panel id="billing">
          <Stack>
            <h2>Billing</h2>
            <p className="text-muted">
              Purchases, subscriptions, and payouts open after billing is
              enabled.
            </p>
          </Stack>
        </Panel>
        
        <InstallApp />
      </Stage>
    </Page>
  )
}
