import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  History,
  Palette,
  Settings2,
  X,
} from 'lucide-react'
import {
  useProgramVersion,
  useUpdateGroup,
  type components,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { GroupCheckInFeed } from './GroupCheckInFeed'
import {
  GroupCheckInModal,
  type CheckInActivityOption,
} from './GroupCheckInModal'
import { buildStageEvents, buildStageMembers } from './stageEvents'
import { getStageTheme, STAGE_THEMES } from './themes/registry'
import type { StageThemeId } from './themes/types'
import { dateLabel, formatRelativeTime } from '@/lib/dates'
import { cn } from '@/lib/utils'

type S = components['schemas']
type DrawerTab = 'history' | 'details' | null

export function GroupStage({
  group: g,
  checkIns,
  hasMoreCheckIns,
  onLoadMoreCheckIns,
  loadingMoreCheckIns,
  viewerId,
  online,
  returnTo,
  detailsContent,
}: {
  group: S['GroupDetail']
  checkIns: S['CompletionShare'][]
  hasMoreCheckIns?: boolean
  onLoadMoreCheckIns?: () => void
  loadingMoreCheckIns?: boolean
  viewerId?: string
  online: boolean
  returnTo?: string | null
  detailsContent: ReactNode
}) {
  const version = useProgramVersion(g.programVersionId, true)
  const updateGroup = useUpdateGroup(g.id)
  const [drawer, setDrawer] = useState<DrawerTab>(null)
  const [checkInOpen, setCheckInOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [previewTheme, setPreviewTheme] = useState<StageThemeId | null>(null)
  const [burst, setBurst] = useState<{ userId: string; emoji: string } | null>(null)

  const activeThemeId: StageThemeId =
    previewTheme ?? (g.stageTheme as StageThemeId | undefined) ?? 'constellation'
  const theme = getStageTheme(activeThemeId)

  const nodes = useMemo(
    () => buildStageMembers(g.members, checkIns),
    [g.members, checkIns],
  )
  const events = useMemo(() => buildStageEvents(checkIns), [checkIns])
  const checkedInMemberCount = nodes.filter((n) => n.checkedInRecently).length
  const selectedNode =
    nodes.find((n) => n.member.user.id === selectedMemberId) ?? null
  const spotlightCheckIn =
    selectedNode?.latestCheckIn ?? checkIns[0] ?? null

  const activityOptions: CheckInActivityOption[] = useMemo(
    () =>
      (version.data?.activities ?? []).map((a) => ({
        id: a.id,
        title: a.title,
      })),
    [version.data?.activities],
  )

  const triggerBurst = (userId: string, emoji: string) => {
    setBurst({ userId, emoji })
    window.setTimeout(() => {
      setBurst((current) =>
        current && current.userId === userId && current.emoji === emoji
          ? null
          : current,
      )
    }, 2200)
  }

  const handleThemeChange = (next: StageThemeId) => {
    setPreviewTheme(next)
    if (g.myRole === 'OWNER' && online) {
      updateGroup.mutate({ stageTheme: next })
    }
  }

  const backHref = returnTo || '/browse'

  useEffect(() => {
    if (!drawer) return
    const isMobile = window.matchMedia('(max-width: 767.98px)').matches
    const prevOverflow = document.body.style.overflow
    if (isMobile) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      if (isMobile) {
        document.body.style.overflow = prevOverflow
      }
    }
  }, [drawer])

  return (
    <main
      id="main"
      tabIndex={-1}
      className="relative flex min-h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-[#060913] text-white"
    >
      {/* Layer 3: Pluggable visual theme canvas */}
      <div className="absolute inset-0">
        <theme.Scene
          groupName={g.name || g.programTitle}
          programTitle={g.programTitle}
          memberCount={g.memberCount}
          checkedInMemberCount={checkedInMemberCount}
          nodes={nodes}
          events={events}
          selectedMemberId={selectedMemberId}
          burstMemberId={burst?.userId ?? null}
          burstEmoji={burst?.emoji ?? null}
          viewerId={viewerId}
          onSelectMember={(userId) =>
            setSelectedMemberId((prev) => (prev === userId ? null : userId))
          }
        />
      </div>

      {/* Layer 1: Minimal Stage Top HUD */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-black/45 px-3.5 py-2 backdrop-blur-md">
          <Link
            to={backHref}
            aria-label="Back"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={16} aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold text-white sm:text-lg">
              {g.name || g.programTitle}
            </h1>
            <p className="truncate text-xs text-white/70">
              {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
              {checkedInMemberCount > 0
                ? ` · ${checkedInMemberCount} checked in`
                : ''}
              {g.startLocalDate ? ` · Starts ${dateLabel(g.startLocalDate)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={drawer === 'history'}
            onClick={() => setDrawer((d) => (d === 'history' ? null : 'history'))}
            className={cn(
              'gap-1.5 rounded-full border border-white/15 bg-black/45 text-white hover:bg-white/15',
              drawer === 'history' && 'border-accent bg-accent/25',
            )}
          >
            <History size={14} aria-hidden />
            <span>Check-ins{checkIns.length > 0 ? ` (${checkIns.length})` : ''}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={drawer === 'details'}
            onClick={() => setDrawer((d) => (d === 'details' ? null : 'details'))}
            className={cn(
              'gap-1.5 rounded-full border border-white/15 bg-black/45 text-white hover:bg-white/15',
              drawer === 'details' && 'border-accent bg-accent/25',
            )}
          >
            <Settings2 size={14} aria-hidden />
            <span>Group Info</span>
          </Button>
        </div>
      </header>

      {/* Center spacer preserves full-screen canvas openness */}
      <div className="pointer-events-none relative z-10 flex-1" />

      {/* Bottom Quiet Spotlight & Minimal Control Dock */}
      <footer className="relative z-20 flex flex-col gap-3 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-between sm:px-6">
        {spotlightCheckIn ? (
          <div className="max-w-md rounded-2xl border border-white/15 bg-black/55 px-4 py-3 backdrop-blur-md">
            <p className="text-xs font-medium text-white/70">
              {selectedNode ? 'Selected member' : 'Latest check-in'}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {spotlightCheckIn.user.id === viewerId
                ? 'You'
                : spotlightCheckIn.user.displayName}{' '}
              completed {spotlightCheckIn.activityTitle}
            </p>
            <p className="mt-0.5 text-xs text-white/70">
              {formatRelativeTime(spotlightCheckIn.completedAt)}
              {spotlightCheckIn.note ? ` · "${spotlightCheckIn.note}"` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setDrawer('history')}
                className="min-h-9 rounded-full border-white/20 bg-white/10 px-3.5 text-xs text-white hover:bg-white/20"
              >
                Open feed &amp; react
              </Button>
              {selectedMemberId && (
                <button
                  type="button"
                  onClick={() => setSelectedMemberId(null)}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Clear selection
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-sm rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-xs text-white/75 backdrop-blur-md">
            Complete an Activity in this Program and share a check-in to illuminate your group&apos;s stage.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {/* Layer 3 Theme Switcher */}
          <div
            role="group"
            aria-label="Animation theme"
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 p-1 backdrop-blur-md"
          >
            <Palette size={13} aria-hidden className="ml-2 text-white/65" />
            {STAGE_THEMES.map((item) => {
              const active = item.id === activeThemeId
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleThemeChange(item.id)}
                  className={cn(
                    'min-h-9 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-white/70 hover:text-white',
                  )}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <Button
            type="button"
            size="md"
            disabled={!online}
            onClick={() => setCheckInOpen(true)}
            className="gap-1.5 rounded-full shadow-lg"
          >
            <CheckCircle2 size={16} aria-hidden />
            <span>Check in</span>
          </Button>
        </div>
      </footer>

      {/* Slide-over History & Group Details Drawer */}
      {drawer && (
        <aside
          aria-label={drawer === 'history' ? 'Group check-ins' : 'Group details'}
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-border bg-background text-foreground shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-bold">
              {drawer === 'history' ? 'Check-ins & History' : 'Group Info & Settings'}
            </h2>
            <button
              type="button"
              aria-label="Close panel"
              onClick={() => setDrawer(null)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface-muted hover:text-foreground"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-5 space-y-5">
            {drawer === 'history' ? (
              <>
                <GroupCheckInFeed
                  shares={checkIns}
                  viewerId={viewerId}
                  disabled={!online}
                  onReacted={(userId, emoji) => triggerBurst(userId, emoji)}
                />
                {hasMoreCheckIns && onLoadMoreCheckIns && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={loadingMoreCheckIns}
                    onClick={onLoadMoreCheckIns}
                    className="w-full"
                  >
                    Load earlier check-ins
                  </Button>
                )}
              </>
            ) : (
              detailsContent
            )}
          </div>
        </aside>
      )}

      <GroupCheckInModal
        open={checkInOpen}
        onClose={() => setCheckInOpen(false)}
        defaultGroupId={g.id}
        activityOptions={activityOptions}
        onCheckedIn={() => {
          if (viewerId) triggerBurst(viewerId, '✨')
        }}
      />
    </main>
  )
}
