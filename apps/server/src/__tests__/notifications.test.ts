// Contract tests for the notifications operations. Scenario tests for this area live alongside in other files.
import { describe, it } from 'vitest'
import { buildTestApp } from './helpers'
import { contractCase } from './helpers/contract'

const app = buildTestApp()

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listNotifications', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listNotifications')
  })
})

describe('getUnreadNotificationCount', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getUnreadNotificationCount')
  })
})

describe('markNotificationsRead', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'markNotificationsRead')
  })
})

describe('unsubscribeDailyEmail', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'unsubscribeDailyEmail')
  })
})
