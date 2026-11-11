import createClient, { type Middleware } from 'openapi-fetch'
import type { paths, components } from './generated/types'

type ClientConfig = {
  baseUrl: string
  getToken?: () => string | null // only for native apps; web uses httpOnly cookies
}

let _client: ReturnType<typeof createClient<paths>> | null = null
let _baseUrl = ''

export function createApiClient(config: ClientConfig) {
  _baseUrl = config.baseUrl.replace(/\/$/, '')
  const client = createClient<paths>({
    baseUrl: config.baseUrl,
    credentials: 'include', // send httpOnly session cookie automatically
  })

  if (config.getToken) {
    const authMiddleware: Middleware = {
      async onRequest({ request }) {
        const token = config.getToken!()
        if (token) request.headers.set('Authorization', `Bearer ${token}`)
        return request
      },
    }
    client.use(authMiddleware)
  }

  _client = client
  return client
}

export function getApiClient() {
  if (!_client) throw new Error('Call createApiClient() before using hooks.')
  return _client
}

export function getApiBaseUrl() {
  return _baseUrl
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public fieldErrors?: Record<string, string>,
    public requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Preserve the server error envelope, including validation and diagnostic context. */
export function apiError(
  response: Response,
  error: components['schemas']['Error'],
): ApiError {
  return new ApiError(
    response.status,
    error.message,
    error.code,
    error.fieldErrors,
    error.requestId,
  )
}

/** Unwrap an openapi-fetch result without introducing another transport layer. */
export function apiData<T>(result: {
  data?: T
  error?: components['schemas']['Error']
  response: Response
}): T {
  if (result.error) throw apiError(result.response, result.error)
  if (result.data === undefined)
    throw new ApiError(
      result.response.status,
      'The server returned an empty response.',
      'EMPTY_RESPONSE',
    )
  return result.data
}
