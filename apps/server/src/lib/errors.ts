// Error contract: 05-ARCHITECTURE.md §3 — { code, message, fieldErrors?, requestId }.
// Services throw AppError; the error handler in app.ts turns it into the response.

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VERSION_CONFLICT'
  | 'ACCESS_REQUIRED'
  | 'PAYMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'MEDIA_PROCESSING'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  ACCESS_REQUIRED: 403,
  PAYMENT_REQUIRED: 402,
  RATE_LIMITED: 429,
  MEDIA_PROCESSING: 409,
  NOT_IMPLEMENTED: 501,
  INTERNAL: 500,
}

export class AppError extends Error {
  readonly statusCode: number
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message)
    this.statusCode = STATUS[code]
  }
}

export const badRequest = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError('VALIDATION_ERROR', message, fieldErrors)
export const unauthorized = (message = 'Not authenticated') => new AppError('UNAUTHORIZED', message)
export const forbidden = (message = 'Not permitted') => new AppError('FORBIDDEN', message)
// Use for anything the caller may not know exists: never leak private objects (05 §3).
export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`)
export const conflict = (message: string) => new AppError('CONFLICT', message)
export const versionConflict = (message = 'This was changed elsewhere. Reload to see the latest version.') =>
  new AppError('VERSION_CONFLICT', message)
export const notImplemented = (operationId: string) =>
  new AppError('NOT_IMPLEMENTED', `${operationId} is not implemented yet`)
