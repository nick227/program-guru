import { Check, Clock, X } from 'lucide-react'
import {
  useProgramPreview,
  useUserByHandle,
  useUserPrograms,
  type components,
} from '@project/sdk'
import { Avatar } from '@/components/ui/Avatar'
import type { PreviewTarget, ShowMeSubject } from '../engine/types'

type S = components['schemas']

interface ShowMeViewProps {
  subject: ShowMeSubject
  todayItems: S['CalendarItem'][]
  activeProgramCount: number
  onClose: () => void
  onPreview: (target: PreviewTarget) => void
}

function ProgramOutlineShowMe({
  programId,
  onPreview,
}: {
  programId: string
  onPreview: (target: PreviewTarget) => void
}) {
  const query = useProgramPreview(programId)
  if (query.isPending) {
    return (
      <div className="h-24 animate-pulse rounded-xl bg-surface-raised/40" />
    )
  }
  const outline = query.data?.safeActivityOutline ?? []
  if (outline.length === 0) {
    return (
      <p className="text-xs text-muted">
        {query.data?.description ?? 'Structured Program ready to start.'}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      {outline.slice(0, 4).map((step, idx) => (
        <button
          key={`${step.title}-${idx}`}
          type="button"
          onClick={() => onPreview({ kind: 'program', id: programId })}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-raised/50 px-3.5 py-2.5 text-left transition hover:bg-surface-raised"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-xs font-semibold text-accent">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <span className="truncate text-sm font-medium">{step.title}</span>
          </div>
          {step.durationMinutes && (
            <span className="shrink-0 text-xs text-muted">
              {step.durationMinutes}m
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function CreatorShowMe({
  handle,
  onPreview,
}: {
  handle: string
  onPreview: (target: PreviewTarget) => void
}) {
  const userQuery = useUserByHandle(handle)
  const progsQuery = useUserPrograms(handle)

  if (userQuery.isPending) {
    return (
      <div className="h-24 animate-pulse rounded-xl bg-surface-raised/40" />
    )
  }
  const profile = userQuery.data
  const progs = progsQuery.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="space-y-3">
      {profile && (
        <div className="flex items-center gap-3.5">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="lg"
          />
          <div className="min-w-0 text-left">
            <p className="truncate text-sm font-semibold">
              {profile.displayName}
            </p>
            <p className="truncate text-xs text-muted">
              @{profile.handle} · {profile.publicProgramCount} Programs ·{' '}
              {profile.followerCount} followers
            </p>
          </div>
        </div>
      )}
      {progs.slice(0, 3).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onPreview({ kind: 'program', id: p.id })}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-raised/50 px-3.5 py-2 text-left transition hover:bg-surface-raised"
        >
          <span className="truncate text-sm font-medium">{p.title}</span>
          <span className="shrink-0 text-xs text-muted">{p.type.label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * Dynamic visual response ("Show me") inside the compact Presentation area.
 */
export function ShowMeView({
  subject,
  todayItems,
  activeProgramCount,
  onClose,
  onPreview,
}: ShowMeViewProps) {
  const sortedToday = todayItems
    .filter((i) => i.status !== 'CANCELLED')
    .slice()
    .sort((a, b) => (a.localTime ?? '99:99').localeCompare(b.localTime ?? '99:99'))

  const doneCount = sortedToday.filter((i) => i.status === 'DONE').length

  return (
    <section
      aria-label="Visual detail"
      className="mx-auto w-full max-w-[620px] pt-2"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {subject.kind === 'program'
            ? `Inside ${subject.title}`
            : subject.kind === 'creator'
              ? subject.displayName
              : subject.kind === 'schedule'
                ? "Today's timeline"
                : subject.kind === 'session'
                  ? `Who's in ${subject.title}`
                  : 'Your progress'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close visual view"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition hover:bg-surface-raised hover:text-inherit"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {subject.kind === 'program' && (
        <ProgramOutlineShowMe programId={subject.id} onPreview={onPreview} />
      )}

      {subject.kind === 'creator' && (
        <CreatorShowMe handle={subject.handle} onPreview={onPreview} />
      )}

      {subject.kind === 'schedule' && (
        <div className="space-y-2">
          {sortedToday.slice(0, 4).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                onPreview({
                  kind: 'scheduled',
                  id: item.id,
                  title: item.title,
                  subtitle: item.localTime ?? 'Today',
                })
              }
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-raised/50 px-3.5 py-2.5 text-left transition hover:bg-surface-raised"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={
                    item.status === 'DONE'
                      ? 'flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent'
                      : 'flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted'
                  }
                >
                  {item.status === 'DONE' ? (
                    <Check size={12} aria-hidden />
                  ) : (
                    <Clock size={11} aria-hidden />
                  )}
                </span>
                <span className="truncate text-sm font-medium">{item.title}</span>
              </div>
              <span className="shrink-0 text-xs text-muted">
                {item.localTime ?? 'Anytime'}
              </span>
            </button>
          ))}
        </div>
      )}

      {subject.kind === 'session' && (
        <div className="flex flex-wrap items-center gap-3">
          {subject.users.slice(0, 6).map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() =>
                onPreview({ kind: 'creator', handle: person.handle })
              }
              className="flex items-center gap-2 rounded-full border border-border bg-surface-raised/60 py-1 pl-1 pr-3 text-xs transition hover:bg-surface-raised"
            >
              <Avatar
                src={person.avatarUrl}
                name={person.displayName}
                size="sm"
              />
              <span>{person.displayName}</span>
            </button>
          ))}
        </div>
      )}

      {subject.kind === 'progress' && (
        <div className="space-y-3 rounded-xl bg-surface-raised/50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {activeProgramCount}{' '}
              {activeProgramCount === 1 ? 'active Program' : 'active Programs'}
            </span>
            <span className="text-xs text-muted">
              {doneCount}/{sortedToday.length} done today
            </span>
          </div>
          {sortedToday.length > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${Math.round((doneCount / sortedToday.length) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
