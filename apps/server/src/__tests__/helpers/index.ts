// Adapted from the factory template: builds the real app (same error handler and routing) with a
// session-free security handler that trusts "Bearer <userId>". Tests exercise business rules;
// the real session transport has its own tests in auth.test.ts.
import { beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import SwaggerParser from '@apidevtools/swagger-parser'
import Ajv from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { db } from '@project/db'
import { buildApp, specPath } from '../../app'
import { forbidden, unauthorized } from '../../lib/errors'
import { setViewerResolver } from '../../lib/auth'
import { setStorageRoot } from '../../infrastructure/storage'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export const testUserId = '00000000-0000-4000-8000-000000000001' // alice
export const testOtherUserId = '00000000-0000-4000-8000-000000000002' // bob
export const testAdminId = '00000000-0000-4000-8000-000000000003' // mod (MODERATOR)
export const rootAdminId = '00000000-0000-4000-8000-0000000000ad' // root (ADMIN), seeded on demand

let derefSpec: any
const getSpec = async () => (derefSpec ??= await SwaggerParser.dereference(specPath))
const ajv = new Ajv({ allErrors: true, strict: false })
addFormats(ajv)

export async function seedUser(id: string, handle: string, opts: { role?: 'USER' | 'MODERATOR' | 'ADMIN'; visibility?: 'PUBLIC' | 'PRIVATE' } = {}) {
  await db.user.create({
    data: {
      id,
      email: `${handle}@test.local`,
      emailVerifiedAt: new Date(),
      role: opts.role ?? 'USER',
      profile: { create: { handle, displayName: handle[0]!.toUpperCase() + handle.slice(1), visibility: opts.visibility ?? 'PUBLIC' } },
      preferences: { create: { timezone: 'America/Chicago' } },
    },
  })
}

async function viewerFromHeader(request: any) {
  const id = request.headers.authorization?.replace('Bearer ', '')
  if (!id) return null
  const user = await db.user.findUnique({ where: { id }, include: { profile: true } })
  return user && user.status === 'ACTIVE' ? user : null
}

async function userFromHeader(request: any) {
  const user = await viewerFromHeader(request)
  if (!user) throw unauthorized()
  request.user = user
}

export function buildTestApp() {
  let app: FastifyInstance
  const handle = {
    inject: (opts: any) => app.inject(opts),
    get instance() {
      return app
    },
  }

  beforeAll(async () => {
    setViewerResolver(viewerFromHeader)
    setStorageRoot(mkdtempSync(join(tmpdir(), 'programs-app-test-storage-')))
    app = await buildApp({
      rateLimit: false,
      securityHandlers: {
        bearerAuth: userFromHeader,
        adminAuth: async (request: any) => {
          await userFromHeader(request)
          if (!['ADMIN', 'MODERATOR'].includes(request.user.role)) throw forbidden()
        },
        adminOnlyAuth: async (request: any) => {
          await userFromHeader(request)
          if (request.user.role !== 'ADMIN') throw forbidden()
        },
      },
    })
    await app.ready()
  })

  beforeEach(async () => {
    await seedUser(testUserId, 'alice')
    await seedUser(testOtherUserId, 'bob')
    await seedUser(testAdminId, 'mod', { role: 'MODERATOR' })
  })

  afterAll(async () => {
    setViewerResolver(null)
    await app?.close()
  })

  return handle
}

export const asAuth = (userId: string) => ({ authorization: `Bearer ${userId}` })

export async function validateResponse(operationId: string, status: number, body: unknown) {
  const spec = await getSpec()
  for (const pathItem of Object.values<any>(spec.paths ?? {})) {
    for (const op of Object.values<any>(pathItem)) {
      if (op?.operationId !== operationId) continue
      const schema = op.responses?.[status]?.content?.['application/json']?.schema
      if (!schema) return
      const validate = ajv.compile(schema)
      if (!validate(body)) {
        throw new Error(`${operationId} ${status} response does not match spec:\n${JSON.stringify(validate.errors, null, 2)}`)
      }
      return
    }
  }
  throw new Error(`Unknown operationId ${operationId}`)
}
