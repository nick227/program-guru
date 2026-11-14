import type { FastifyRequest } from 'fastify'
import type { operations } from '../../../../packages/sdk/src/generated/types'
import { requireUser } from './auth'

type Params<O extends keyof operations> =
  operations[O] extends { parameters: { path: infer P } } ? P : never
type Body<O extends keyof operations> =
  operations[O] extends { requestBody: { content: { 'application/json': infer B } } } ? B : never
type Query<O extends keyof operations> =
  operations[O] extends { parameters: { query: infer Q } } ? Q : never

/** Typed request boundary for simple authenticated operations returning { data }.
 * Keeps OpenAPI transport details out of domain services. Complex handlers stay explicit.
 */
export function authenticatedHandler<O extends keyof operations, T>(
  _operationId: O,
  fn: (ctx: { userId: string; params: Params<O>; body: Body<O>; query: Query<O> }) => Promise<T>,
) {
  return async (request: FastifyRequest): Promise<{ data: T }> => {
    const userId = requireUser(request).id
    return {
      data: await fn({
        userId,
        params: request.params as Params<O>,
        body: request.body as Body<O>,
        query: request.query as Query<O>,
      }),
    }
  }
}
