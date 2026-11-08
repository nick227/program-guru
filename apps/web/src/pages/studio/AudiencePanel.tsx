import {
  useCurrentUser,
  useUserByHandle,
  useMyFollowRequests,
  useApproveFollowRequest,
  useDeclineFollowRequest,
  useMyPrograms,
  useProgramAccessRequests,
  useApproveProgramAccessRequest,
  useDeclineProgramAccessRequest,
  useCreatorEarnings,
} from '@project/sdk'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'

export function AudiencePanel() {
  const me = useCurrentUser()
  const handle = me.data?.data.profile.handle ?? ''
  const profileQuery = useUserByHandle(handle)
  const earnings = useCreatorEarnings()
  const profile = profileQuery.data
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Audience</h2>
          <p className="text-sm text-muted">
            Followers, Program participants, and paying channel subscribers are
            distinct. Rosters need list APIs; counts and approval queues work
            now.
          </p>
          {profile ? (
            <Row className="gap-6 text-sm">
              <span>{profile.followerCount} followers</span>
              <span>{profile.followingCount} following</span>
              <span>
                {earnings.data?.activeSubscriptions ?? '—'} Program
                subscriptions (buyers)
              </span>
            </Row>
          ) : null}
          <p role="status" className="text-sm text-muted">
            Channel subscriber roster and follower lists are blocked on backend
            contracts.
          </p>
        </Stack>
      </Panel>
      <FollowRequests />
      <AccessApprovals />
    </Stack>
  )
}

function FollowRequests() {
  const requests = useMyFollowRequests()
  const approve = useApproveFollowRequest()
  const decline = useDeclineFollowRequest()
  const rows = requests.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Panel>
      <Stack>
        <h3>Follow requests</h3>
        <ErrorMessage
          error={requests.error || approve.error || decline.error}
          retry={() => void requests.refetch()}
        />
        {requests.isPending ? <Loading /> : null}
        {!requests.error && !rows.length && !requests.isPending ? (
          <p>No pending follow requests.</p>
        ) : null}
        {rows.map((request) => (
          <Row key={request.id} className="justify-between">
            <span>{request.requester.displayName}</span>
            <Row>
              <Button
                loading={approve.isPending}
                onClick={() => approve.mutate(request.id)}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                loading={decline.isPending}
                onClick={() => decline.mutate(request.id)}
              >
                Decline
              </Button>
            </Row>
          </Row>
        ))}
      </Stack>
    </Panel>
  )
}

function AccessApprovals() {
  const programs = useMyPrograms()
  const [programId, setProgramId] = useState('')
  const programRows = programs.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Panel>
      <Stack>
        <h3>Program access requests</h3>
        <label>
          Program
          <select
            className="mt-1 w-full rounded-lg border bg-surface px-3 py-2"
            value={programId}
            onChange={(event) => setProgramId(event.target.value)}
          >
            <option value="">Choose…</option>
            {programRows.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title}
              </option>
            ))}
          </select>
        </label>
        {programId ? <AccessRequestList programId={programId} /> : null}
      </Stack>
    </Panel>
  )
}

function AccessRequestList({ programId }: { programId: string }) {
  const requests = useProgramAccessRequests(programId)
  const approve = useApproveProgramAccessRequest(programId)
  const decline = useDeclineProgramAccessRequest(programId)
  const rows = requests.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <ErrorMessage
        error={requests.error || approve.error || decline.error}
        retry={() => void requests.refetch()}
      />
      {requests.isPending ? <Loading /> : null}
      {!requests.error && !rows.length && !requests.isPending ? (
        <p>No access requests for this Program.</p>
      ) : null}
      {rows.map((request) => (
        <Row key={request.id} className="justify-between">
          <span>
            {request.user.displayName} · {request.status}
          </span>
          {request.status === 'PENDING' && (
            <Row>
              <Button
                loading={approve.isPending}
                onClick={() => approve.mutate(request.id)}
              >
                Approve
              </Button>
              <Button
                variant="outline"
                loading={decline.isPending}
                onClick={() => decline.mutate(request.id)}
              >
                Decline
              </Button>
            </Row>
          )}
        </Row>
      ))}
    </Stack>
  )
}
