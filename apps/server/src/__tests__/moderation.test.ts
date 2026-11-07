// Contract tests for the moderation operations. Scenario tests for this area live alongside in other files.
import { describe, it } from 'vitest'
import { buildTestApp } from './helpers'
import { contractCase } from './helpers/contract'

const app = buildTestApp()

// ── Contract: one block per operationId (pnpm test:generate recognizes these) ──

describe('createReport', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'createReport')
  })
})

describe('listReports', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listReports')
  })
})

describe('resolveReport', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'resolveReport')
  })
})

describe('listPendingPublications', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'listPendingPublications')
  })
})

describe('moderateMediaPublication', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'moderateMediaPublication')
  })
})

describe('grantProgramAccess', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'grantProgramAccess')
  })
})

describe('revokeProgramAccess', () => {
  it('matches the contract', async () => {
    await contractCase(app, 'revokeProgramAccess')
  })
})
