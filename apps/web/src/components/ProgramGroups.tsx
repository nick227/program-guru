import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCreateGroup, useMyGroups } from '@project/sdk'
import type { components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { isLocalDate, today } from '@/lib/dates'
import { buildGroupUrl, buildProgramUrl } from '@/lib/urls'

type GroupSummary = components['schemas']['GroupSummary']

export function ProgramGroups({
  programId,
  versionId,
  enrollmentId,
  isProgramOwner,
  timezone,
}: {
  programId: string
  versionId: string | null
  enrollmentId: string | null
  isProgramOwner: boolean
  timezone: string
}) {
  const navigate = useNavigate()
  const groups = useMyGroups()
  const create = useCreateGroup()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'SYNC' | 'ASYNC'>('SYNC')
  const [creating, setCreating] = useState(false)
  const [startDate, setStartDate] = useState(today(timezone))
  const canCreate = !!enrollmentId || isProgramOwner
  const matching = (groups.data?.pages.flatMap((page) => page.data) ?? []).filter(
    (group: GroupSummary) => group.programVersionId === versionId,
  )

  async function createGroup() {
    if (!versionId) return
    try {
      const group = await create.mutateAsync({
        programVersionId: versionId,
        mode,
        name: name.trim() || null,
        ...(mode === 'SYNC' && !enrollmentId
          ? { startLocalDate: startDate, timezone }
          : {}),
      })
      if (enrollmentId) {
        navigate(buildGroupUrl(group.id))
      } else {
        navigate(
          buildProgramUrl(
            { id: programId },
            {
              groupId: group.id,
              startDate: mode === 'SYNC' ? startDate : undefined,
            },
          ),
        )
      }
    } catch {
      // The mutation error remains visible so the user can correct and retry.
    }
  }

  return (
    <Panel>
      <Stack>
        <h2>Program groups</h2>
        {groups.isPending && <Loading />}
        <ErrorMessage error={groups.error} retry={() => void groups.refetch()} />
        {matching.map((group) => (
          <Row key={group.id} className="justify-between">
            <span>
              {group.name || group.programTitle} · {group.memberCount}{' '}
              {group.memberCount === 1 ? 'participant' : 'participants'} ·{' '}
              {group.mode === 'SYNC' ? 'Same start' : 'Flexible start'}
            </span>
            <Link
              className="text-accent underline"
              to={`/groups/${group.id}`}
            >
              Open group
            </Link>
          </Row>
        ))}
        {!matching.length && !groups.isPending && !groups.error && (
          <p className="text-sm text-muted">
            Start a group to follow this Program with other people. Everyone
            keeps an independent calendar and private results.
          </p>
        )}
        {canCreate && versionId ? (
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
                    mode === 'SYNC' &&
                    !enrollmentId &&
                    !isLocalDate(startDate)
                  }
                  onClick={() => void createGroup()}
                >
                  Create group
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
            <Button onClick={() => setCreating(true)}>Start a group</Button>
          )
        ) : (
          <p className="text-sm text-muted">
            Join this Program before starting a group.
          </p>
        )}
      </Stack>
    </Panel>
  )
}
