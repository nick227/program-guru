import { Link } from 'react-router-dom'
import { Users, ArrowRight } from 'lucide-react'
import { useGroup } from '@project/sdk'
import { AvatarStack } from '@/components/social/AvatarStack'
import { ShareLinkCard } from '@/components/social/ShareLink'
import { buildGroupUrl } from '@/lib/urls'

export interface ProgramTogetherProps {
  programId: string
  groupId?: string | null
  participantCount?: number | null
  completionRate?: number | null
  publicUrl: string
  returnTo?: string
  className?: string
}

/**
 * Compact "Share Program" community area:
 * Genuine participant stats, real group avatars, group entry point, and direct share.
 */
export function ProgramTogether({
  groupId,
  participantCount = 0,
  completionRate,
  publicUrl,
  returnTo,
  className,
}: ProgramTogetherProps) {
  const group = useGroup(groupId ?? '')

  const hasGroup = !!groupId && !!group.data
  const members =
    group.data?.members.map((m) => ({
      id: m.user.id,
      name: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
    })) ?? []

  return (
    <ShareLinkCard
      title="Share Link"
      ariaLabel="Share Program"
      url={publicUrl}
      shareTitle="Join me on this Program"
      copiedMessage="Program link copied"
      inputLabel="Program link"
      className={className}
    >
      {/* Real Group Presence (if viewer has a group) */}
      {hasGroup && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-surface-muted p-3.5 border border-border">
          <div className="flex items-center gap-3">
            <AvatarStack people={members} max={4} />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                {group.data?.name || 'Your Group'}
              </div>
              <div className="text-xs text-muted">
                {group.data?.memberCount}{' '}
                {group.data?.memberCount === 1 ? 'member' : 'members'} ·{' '}
                {group.data?.mode === 'SYNC'
                  ? 'Shared schedule'
                  : 'Flexible pace'}
              </div>
            </div>
          </div>
          <Link
            to={buildGroupUrl(groupId!, returnTo ? { returnTo } : undefined)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
          >
            <span>Open Group</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Community Participant Signals */}
      {((participantCount ?? 0) > 0 || completionRate != null) && !hasGroup && (
        <div className="flex items-center gap-4 rounded-lg bg-surface-muted/60 p-3 text-sm text-foreground">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">
              {(participantCount ?? 0) > 0
                ? `${participantCount!.toLocaleString()} participants enrolled`
                : 'Active community'}
            </div>
            {completionRate != null && (
              <div className="text-xs text-muted">
                {Math.round(completionRate * 100)}% completed all sessions
              </div>
            )}
          </div>
        </div>
      )}
    </ShareLinkCard>
  )
}
