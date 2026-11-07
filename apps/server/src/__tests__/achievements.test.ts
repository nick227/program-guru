// Contract tests for the achievements operations. Scenario tests for this area live alongside in other files.
import { describe, it } from 'vitest'
import { buildTestApp } from './helpers'
import { contractCase } from './helpers/contract'

const app = buildTestApp()

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('listMyAchievements', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listMyAchievements')
  })
})

describe('updateMyAchievement', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'updateMyAchievement')
  })
})

describe('listUserAchievements', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listUserAchievements')
  })
})
