import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Share2, Users, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useGroup } from '@project/sdk'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AvatarStack } from '@/components/AvatarStack'
import { buildGroupUrl } from '@/lib/urls'
import { cn } from '@/lib/utils'

export interface ProgramTogetherProps {
  programId: string
  groupId?: string | null
  participantCount?: number | null
  completionRate?: number | null
  publicUrl: string
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
  className,
}: ProgramTogetherProps) {
  const group = useGroup(groupId ?? '')
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      toast.success('Program link copied')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const handleNativeShare = async () => {
    try {
      await navigator.share({ title: 'Join me on this Program', url: publicUrl })
    } catch {
      // dismissed
    }
  }

  const hasGroup = !!groupId && !!group.data
  const members = group.data?.members.map((m) => ({
    id: m.user.id,
    name: m.user.displayName,
    avatarUrl: m.user.avatarUrl,
  })) ?? []

  return (
    <section
      aria-label="Share Program"
      className={cn('rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5', className)}
    >
      <SectionHeader
        title="Share Program"
        description="Follow this Program with friends, a team, or your community."
        className="pb-0"
      />

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
                {group.data?.memberCount} {group.data?.memberCount === 1 ? 'member' : 'members'} ·{' '}
                {group.data?.mode === 'SYNC' ? 'Shared schedule' : 'Flexible pace'}
              </div>
            </div>
          </div>
          <Link
            to={buildGroupUrl(groupId!)}
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

      {/* Share with others */}
      <div className="space-y-2 pt-1">
        <label className="text-xs font-medium text-muted block">
          Invite people or share this Program
        </label>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={publicUrl}
            className="h-9 min-w-0 flex-1 font-mono text-xs select-all bg-surface-muted text-foreground"
            onFocus={(e) => e.target.select()}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 shrink-0 gap-1.5 px-3.5 text-xs font-semibold"
            onClick={handleCopy}
          >
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : 'Copy link'}</span>
          </Button>
          {canShare && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-9 shrink-0 p-0 text-muted hover:text-foreground"
              aria-label="Share via device"
              onClick={handleNativeShare}
            >
              <Share2 size={14} />
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}

