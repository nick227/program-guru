import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import openapiGlue from 'fastify-openapi-glue'
import { load } from 'js-yaml'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Prisma } from '@project/db'
import * as handlers from './handlers'
import * as security from './plugins/security'
import { AppError } from './lib/errors'

export const specPath = resolve(__dirname, '../../../packages/api-spec/openapi.yaml')

type BuildOptions = {
  logger?: FastifyServerOptions['logger']
  /** Tests swap in a session-free handler that trusts "Bearer <userId>". */
  securityHandlers?: Record<string, (request: any, reply: any, params: any) => Promise<void>>
  docs?: boolean
  rateLimit?: boolean
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    genReqId: () => crypto.randomUUID(),
    ajv: { customOptions: { removeAdditional: false, coerceTypes: 'array', useDefaults: true } },
  })

  await app.register(cors, { origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173', credentials: true })
  await app.register(cookie)
  if (opts.rateLimit !== false) {
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })
  }

  if (opts.docs) {
    const spec = load(readFileSync(specPath, 'utf-8')) as object
    await app.register(swagger, { openapi: spec as any })
    await app.register(swaggerUi, { routePrefix: '/docs' })
  }

  // Registered before the glue so validation errors serialize with the spec's Error schema.
  app.setErrorHandler((err: any, request, reply) => {
    let error = err
    const requestId = String(request.id)
    if (error.validation) {
      const fieldErrors: Record<string, string> = {}
      for (const v of error.validation) {
        const key = (v.instancePath || '').replace(/^\//, '').replace(/\//g, '.') || v.params?.missingProperty || 'request'
        fieldErrors[key] = v.message ?? 'is invalid'
      }
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message: 'Some fields need attention', fieldErrors, requestId })
    }
    // fastify-openapi-glue wraps security handler failures; surface the most specific one.
    if (Array.isArray(error.errors) && error.constructor?.name === 'SecurityError') {
      const inner = error.errors.find((e: unknown) => e instanceof AppError && e.code !== 'UNAUTHORIZED') ?? null
      error = inner ?? new AppError('UNAUTHORIZED', 'Not authenticated')
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        requestId,
      })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found', requestId })
      if (error.code === 'P2002') return reply.status(409).send({ code: 'CONFLICT', message: 'Already exists', requestId })
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({ code: 'RATE_LIMITED', message: 'Too many requests', requestId })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ code: error.code ?? 'ERROR', message: error.message, requestId })
    }
    request.log.error(error)
    return reply.status(500).send({ code: 'INTERNAL', message: 'Something went wrong', requestId })
  })

  // Each operation answers with the single 2xx status its spec declares (201 for creates), unless
  // a handler sets one explicitly. Must be added before the glue registers routes.
  app.addHook('onRoute', (route) => {
    const codes = Object.keys((route.schema as any)?.response ?? {}).filter((c) => /^2\d\d$/.test(c))
    if (codes.length !== 1 || codes[0] === '200') return
    const status = Number(codes[0])
    const existing = route.preHandler ? (Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler]) : []
    route.preHandler = [
      async (_request, reply) => {
        reply.code(status)
      },
      ...existing,
    ]
  })

  await app.register(openapiGlue, {
    specification: specPath,
    serviceHandlers: handlers,
    securityHandlers: opts.securityHandlers ?? security,
    noAdditional: true,
  } as any)

  app.get('/health', async () => ({ status: 'ok' }))
  return app
}
