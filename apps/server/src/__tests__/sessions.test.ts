// Contract tests for the sessions operations. Scenario tests for this area live alongside in other files.
import { describe, it } from 'vitest'
import { buildTestApp } from './helpers'
import { contractCase } from './helpers/contract'

const app = buildTestApp()

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('createSession', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createSession')
  })
})

describe('getSession', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'getSession')
  })
})

describe('applySessionAction', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'applySessionAction')
  })
})

describe('saveSessionResult', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'saveSessionResult')
  })
})
