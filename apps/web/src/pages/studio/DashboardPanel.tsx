import {
  useCreatorEarnings,
  usePayoutAccount,
  useMyPrograms,
  useProgramPreview,
} from '@project/sdk'
import { useState } from 'react'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Stack } from '@/components/ui/Layout'

function formatMoney(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'USD',
  }).format(minor / 100)
}

export function DashboardPanel() {
  const earnings = useCreatorEarnings()
  const payout = usePayoutAccount()
  const programs = useMyPrograms('PUBLISHED')
  const [programId, setProgramId] = useState('')
  const preview = useProgramPreview(programId)
  const programRows = programs.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Dashboard</h2>
          <p className="text-sm text-muted">
            Earnings and Program participation from existing billing and preview
            contracts. Channel subscriber analytics need Channel Entitlement.
          </p>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <h3>Earnings</h3>
          <ErrorMessage
            error={earnings.error || payout.error}
            retry={() => {
              void earnings.refetch()
              void payout.refetch()
            }}
          />
          {earnings.isPending || payout.isPending ? <Loading /> : null}
          {earnings.data ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt>Gross</dt>
              <dd>
                {formatMoney(earnings.data.grossMinor, earnings.data.currency)}
              </dd>
              <dt>Platform fees</dt>
              <dd>
                {formatMoney(
                  earnings.data.platformFeesMinor,
                  earnings.data.currency,
                )}
              </dd>
              <dt>Net</dt>
              <dd>
                {formatMoney(earnings.data.netMinor, earnings.data.currency)}
              </dd>
              <dt>Active Program subscriptions</dt>
              <dd>{earnings.data.activeSubscriptions}</dd>
              <dt>Purchases</dt>
              <dd>{earnings.data.purchases}</dd>
            </dl>
          ) : null}
          <p className="text-sm text-muted">
            Payout account:{' '}
            {payout.data
              ? `${payout.data.status}${payout.data.payoutsEnabled ? ' · payouts on' : ''}`
              : 'not connected'}
          </p>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <h3>Program engagement</h3>
          <label>
            Published Program
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
          <ErrorMessage
            error={preview.error}
            retry={() => void preview.refetch()}
          />
          {preview.isPending && programId ? <Loading /> : null}
          {preview.data ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt>Enrollments</dt>
              <dd>{preview.data.enrollmentCount}</dd>
              <dt>Completion rate</dt>
              <dd>
                {preview.data.completionRate == null
                  ? 'Insufficient sample'
                  : `${Math.round(preview.data.completionRate * 100)}%`}
              </dd>
            </dl>
          ) : null}
        </Stack>
      </Panel>
    </Stack>
  )
}
