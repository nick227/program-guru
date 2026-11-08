import { describe, it, expect } from 'vitest'
import { productionConfigProblems } from '../../lib/config'

const strong = (c: string) => c.repeat(40)
const complete = {
  NODE_ENV: 'production',
  DATABASE_URL: 'mysql://u:p@db:3306/app',
  STORAGE_PROVIDER: 'r2',
  R2_BUCKET: 'media',
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  MEDIA_URL_SECRET: strong('m'),
  EMAIL_LINK_SECRET: strong('e'),
  PUBLIC_API_URL: 'https://api.example.com',
  PUBLIC_APP_URL: 'https://app.example.com',
  CORS_ORIGIN: 'https://app.example.com',
  CLIENT_IP_HEADER: 'x-real-ip',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_x',
  EMAIL_FROM: 'Programs <hello@example.com>',
}

describe('production configuration gate', () => {
  it('passes a complete production configuration for every process', () => {
    for (const role of ['api', 'worker', 'bootstrap'] as const) expect(productionConfigProblems(role, complete)).toEqual([])
  })

  it('requires an explicit client IP decision for the API behind the proxy', () => {
    expect(productionConfigProblems('api', { ...complete, CLIENT_IP_HEADER: undefined })).toEqual(['CLIENT_IP_HEADER must be x-real-ip (behind Railway) or none'])
    expect(productionConfigProblems('api', { ...complete, CLIENT_IP_HEADER: 'x-forwarded-for' })).toEqual(['CLIENT_IP_HEADER must be x-real-ip (behind Railway) or none'])
    expect(productionConfigProblems('worker', { ...complete, CLIENT_IP_HEADER: undefined })).toEqual([])
  })

  it('accepts an S3-compatible endpoint instead of an R2 account', () => {
    const s3 = { ...complete, R2_ACCOUNT_ID: undefined, S3_ENDPOINT: 'https://storage.example.com' }
    expect(productionConfigProblems('api', s3)).toEqual([])
    expect(productionConfigProblems('api', { ...s3, S3_ENDPOINT: 'http://storage.example.com' })).toEqual(['S3_ENDPOINT must be an https URL'])
    expect(productionConfigProblems('api', { ...complete, R2_ACCOUNT_ID: undefined })).toEqual(['R2_ACCOUNT_ID is required'])
  })

  it('never applies outside production', () => {
    expect(productionConfigProblems('api', { NODE_ENV: 'development' })).toEqual([])
  })

  it('refuses development signing secrets, local storage and captured email', () => {
    const problems = productionConfigProblems('worker', { ...complete, MEDIA_URL_SECRET: undefined, EMAIL_LINK_SECRET: 'short', STORAGE_PROVIDER: 'local', EMAIL_PROVIDER: 'capture' })
    expect(problems).toEqual(
      expect.arrayContaining([
        'MEDIA_URL_SECRET must be set to a random value of at least 32 characters',
        'EMAIL_LINK_SECRET must be set to a random value of at least 32 characters',
        'STORAGE_PROVIDER must be r2',
        'EMAIL_PROVIDER must be resend (capture never delivers)',
      ]),
    )
  })

  it('requires https URLs, distinct secrets, and Stripe only when the marketplace is on', () => {
    expect(productionConfigProblems('api', { ...complete, PUBLIC_API_URL: 'http://api.example.com', EMAIL_LINK_SECRET: complete.MEDIA_URL_SECRET })).toEqual([
      'MEDIA_URL_SECRET and EMAIL_LINK_SECRET must differ',
      'PUBLIC_API_URL must be an https URL',
    ])
    expect(productionConfigProblems('api', { ...complete, MARKETPLACE_ENABLED: 'true' })).toEqual(['STRIPE_API_KEY is required', 'STRIPE_WEBHOOK_SECRET is required'])
  })
})
