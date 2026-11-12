import { useMemo, useState } from 'react'
import {
  useAcceptMyGroupInvitation,
  useApproveFollowRequest,
  useDeclineFollowRequest,
  useDeclineMyGroupInvitation,
  useMyFollowRequests,
  useMyGroupInvitations,
} from '@project/sdk'
import type { NotificationInlineAction } from '@/components/account/NotificationRow'
import {
  notificationIds,
  notificationTargetId,
  type NotificationItem,
} from './notifications'

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  return 'Could not complete action. Open to review.'
}

export function useNotificationActions({
  rows,
  enabled = true,
  onMarkRead,
}: {
  rows: NotificationItem[]
  enabled?: boolean
  onMarkRead: (ids: string[]) => void
}) {
  const hasFollowRequest =
    enabled && rows.some((r) => r.type === 'FOLLOW_REQUEST')
  const hasGroupInvite = enabled && rows.some((r) => r.type === 'GROUP_INVITE')

  const followRequests = useMyFollowRequests({ enabled: hasFollowRequest })
  const groupInvites = useMyGroupInvitations(hasGroupInvite)

  const approveFollow = useApproveFollowRequest()
  const declineFollow = useDeclineFollowRequest()
  const acceptInvite = useAcceptMyGroupInvitation()
  const declineInvite = useDeclineMyGroupInvitation()

  const [pendingId, setPendingId] = useState<string | null>(null)
  const [resolved, setResolved] = useState<
    Record<string, 'accepted' | 'declined'>
  >({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const pendingFollowIds = useMemo(() => {
    const set = new Set<string>()
    for (const page of followRequests.data?.pages ?? []) {
      for (const req of page.data) {
        set.add(req.id)
      }
    }
    return set
  }, [followRequests.data])

  const pendingInviteIds = useMemo(() => {
    const set = new Set<string>()
    for (const page of groupInvites.data?.pages ?? []) {
      for (const inv of page.data) {
        set.add(inv.id)
      }
    }
    return set
  }, [groupInvites.data])

  const runAction = async (
    notification: NotificationItem,
    outcome: 'accepted' | 'declined',
    action: () => Promise<unknown>,
  ) => {
    setPendingId(notification.id)
    setErrors((prev) => {
      const next = { ...prev }
      delete next[notification.id]
      return next
    })
    try {
      await action()
      setResolved((prev) => ({ ...prev, [notification.id]: outcome }))
      if (!notification.readAt) {
        onMarkRead(notificationIds(notification))
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [notification.id]: extractErrorMessage(err),
      }))
    } finally {
      setPendingId(null)
    }
  }

  return (n: NotificationItem): NotificationInlineAction | undefined => {
    const outcome = resolved[n.id] ?? null
    const error = errors[n.id] ?? null

    if (n.type === 'FOLLOW_REQUEST') {
      const requestId = notificationTargetId(n)
      const canAct = Boolean(requestId && pendingFollowIds.has(requestId))
      if (!canAct && !outcome && !error) return undefined
      return {
        canAct,
        pending: pendingId === n.id,
        resolved: outcome,
        error,
        onAccept: () =>
          requestId &&
          void runAction(n, 'accepted', () =>
            approveFollow.mutateAsync(requestId),
          ),
        onDecline: () =>
          requestId &&
          void runAction(n, 'declined', () =>
            declineFollow.mutateAsync(requestId),
          ),
      }
    }

    if (n.type === 'GROUP_INVITE') {
      const invitationId = notificationTargetId(n)
      const canAct = Boolean(invitationId && pendingInviteIds.has(invitationId))
      if (!canAct && !outcome && !error) return undefined
      return {
        canAct,
        pending: pendingId === n.id,
        resolved: outcome,
        error,
        onAccept: () =>
          invitationId &&
          void runAction(n, 'accepted', () =>
            acceptInvite.mutateAsync(invitationId),
          ),
        onDecline: () =>
          invitationId &&
          void runAction(n, 'declined', () =>
            declineInvite.mutateAsync(invitationId),
          ),
      }
    }

    return undefined
  }
}
