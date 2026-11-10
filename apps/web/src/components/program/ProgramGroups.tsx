import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCreateGroup, useMyGroups, useGroup } from '@project/sdk'
import type { components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { isLocalDate, today } from '@/lib/dates'
import { buildGroupUrl, buildProgramUrl } from '@/lib/urls'

import { useOnline } from '@/lib/useOnline'
import { GroupInviteLink } from '@/components/social/GroupInviteLink'
import { AvatarStack } from '@/components/social/AvatarStack'

type GroupSummary = components['schemas']['GroupSummary']

export function ProgramGroups({
  programId,
  versionId,
  enrollmentId,
  isProgramOwner,
  timezone,
  title = 'Do this together',
}: {
  programId: string
  versionId: string | null
  enrollmentId: string | null
  isProgramOwner: boolean
  timezone: string
  title?: string | null
}) {
  const online = useOnline()
  const groups = useMyGroups()
  const create = useCreateGroup()
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'SYNC' | 'ASYNC'>('ASYNC')
  const [creating, setCreating] = useState(false)
  const [startDate, setStartDate] = useState(today(timezone))
  useEffect(() => {
    if (groups.hasNextPage && !groups.isFetchingNextPage && !groups.isFetchNextPageError) void groups.fetchNextPage()
  }, [groups.hasNextPage, groups.isFetchingNextPage, groups.isFetchNextPageError, groups.fetchNextPage])
  const canCreate = !!enrollmentId || isProgramOwner
  // A group belongs to the Program, not a version: members on v1 and v2 share it (10 §2).
  const matching = (groups.data?.pages.flatMap((page) => page.data) ?? []).filter(
    (group: GroupSummary) => group.programId === programId,
  )

  async function createGroup() {
    if (!versionId || !online || create.isPending) return
    try {
      const group = await create.mutateAsync({
        programVersionId: versionId,
        mode,
        name: name.trim() || null,
        ...(mode === 'SYNC' && !enrollmentId
          ? { startLocalDate: startDate, timezone }
          : {}),
      })
      setCreating(false)
      setCreatedGroupId(group.id)
    } catch {
      // The mutation error remains visible so the user can correct and retry.
    }
  }

  return (
    <Panel>
      <Stack>
        {title && <h2>{title}</h2>}
        {groups.isPending && <Loading />}
        <ErrorMessage error={groups.error} retry={() => void groups.refetch()} />
        {matching.map((group) => <Participation key={group.id} groupId={group.id} programId={programId} />)}
        {createdGroupId && !matching.some((g) => g.id === createdGroupId) && <Participation groupId={createdGroupId} programId={programId} />}
        {!matching.length && !createdGroupId && canCreate && versionId ? (
          creating ? (
            <Stack>
              <label className="space-y-2">
                Group name (optional)
                <Input
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label className="space-y-2">
                Schedule
                <select
                  className="min-h-11 w-full rounded-lg border bg-surface px-3"
                  value={mode}
                  onChange={(event) =>
                    setMode(event.target.value as 'SYNC' | 'ASYNC')
                  }
                >
                  <option value="SYNC">Same start date</option>
                  <option value="ASYNC">Flexible start dates</option>
                </select>
              </label>
              {mode === 'SYNC' &&
                (enrollmentId ? (
                  <p className="text-xs text-muted">
                    Your current Program start date is used for a same-start group.
                  </p>
                ) : (
                  <>
                    <label className="space-y-2">
                      Shared start date
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </label>
                    <p className="text-xs text-muted">{timezone}</p>
                  </>
                ))}
              <Row>
                <Button
                  loading={create.isPending}
                  disabled={
                    !online || create.isPending || (mode === 'SYNC' && !enrollmentId && !isLocalDate(startDate))
                  }
                  onClick={() => void createGroup()}
                >
                  Continue
                </Button>
                <Button
                  variant="outline"
                  disabled={create.isPending}
                  onClick={() => setCreating(false)}
                >
                  Cancel
                </Button>
              </Row>
              <ErrorMessage error={create.error} />
            </Stack>
          ) : (
            <Button disabled={groups.isPending || groups.hasNextPage || !!groups.error} onClick={() => setCreating(true)}>Invite people</Button>
          )
        ) : !matching.length && !createdGroupId ? (
          <p className="text-sm text-muted">
            {versionId ? 'Join this Program to invite people to participate with you.' : 'Prepare a published version to invite people. Your Program can stay private.'}
          </p>
        ) : null}
      </Stack>
    </Panel>
  )
}

function Participation({ groupId, programId }: { groupId: string; programId: string }) {
  const group = useGroup(groupId)
  return (
    <Stack className="gap-2">
      {group.data && <Row className="justify-between">
        <AvatarStack people={group.data.members.map((m) => ({ id: m.user.id, name: m.user.displayName, avatarUrl: m.user.avatarUrl }))} max={5} />
        <span className="text-sm text-muted">{group.data.memberCount} {group.data.memberCount === 1 ? 'participant' : 'participants'} · {group.data.mode === 'ASYNC' ? 'Flexible pace' : 'Shared start'}</span>
        <Link className="text-sm text-accent underline" to={buildGroupUrl(groupId)}>View group</Link>
      </Row>}
      <GroupInviteLink groupId={groupId} />
      {group.data && !group.data.myEnrollment && <Link className="text-sm text-accent underline" to={buildProgramUrl({ id: programId }, { groupId, startDate: group.data.startLocalDate ?? undefined })}>Add to my Calendar</Link>}
    </Stack>
  )
}
