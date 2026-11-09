// Production configuration gate. Every process (API, worker, bootstrap) calls this at startup so a
// missing or weak setting stops the deploy instead of silently using a development default, such as
// a public signing secret (forgeable media URLs and email links) or captured, never-sent email.
export type ProcessRole = 'api' | 'worker' | 'bootstrap'

const isUrl = (v: string | undefined, https: boolean) => {
  try {
    const u = new URL(v ?? '')
    return https ? u.protocol === 'https:' : !!u.protocol
  } catch {
    return false
  }
}

export function productionConfigProblems(role: ProcessRole, env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return []
  const problems: string[] = []
  const need = (name: string, ok = !!env[name], why = 'is required') => {
    if (!ok) problems.push(`${name} ${why}`)
  }
  const secret = (name: string) => need(name, (env[name]?.length ?? 0) >= 32, 'must be set to a random value of at least 32 characters')

  need('DATABASE_URL')
  // Local storage is never shared between the API and worker services (ALLOW_LOCAL_STORAGE is for rehearsals only).
  if (env.ALLOW_LOCAL_STORAGE !== 'true') {
    need('STORAGE_PROVIDER', env.STORAGE_PROVIDER === 'r2', 'must be r2')
    // R2_ACCOUNT_ID builds the R2 endpoint; another S3-compatible store supplies S3_ENDPOINT instead.
    for (const name of ['R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', ...(env.S3_ENDPOINT ? [] : ['R2_ACCOUNT_ID'])]) need(name)
    if (env.S3_ENDPOINT) need('S3_ENDPOINT', isUrl(env.S3_ENDPOINT, true), 'must be an https URL')
  }
  if (role === 'bootstrap') return problems

  secret('MEDIA_URL_SECRET')
  secret('EMAIL_LINK_SECRET')
  if (env.MEDIA_URL_SECRET && env.MEDIA_URL_SECRET === env.EMAIL_LINK_SECRET) problems.push('MEDIA_URL_SECRET and EMAIL_LINK_SECRET must differ')
  need('PUBLIC_API_URL', isUrl(env.PUBLIC_API_URL, true), 'must be an https URL')
  need('PUBLIC_APP_URL', isUrl(env.PUBLIC_APP_URL, true), 'must be an https URL')
  if (role === 'api') {
    need('CORS_ORIGIN', isUrl(env.CORS_ORIGIN, true), 'must be the https web origin')
    // An explicit decision: without it every client behind Railway's proxy shares one rate-limit identity.
    need('CLIENT_IP_HEADER', ['x-real-ip', 'none'].includes(env.CLIENT_IP_HEADER ?? ''), 'must be x-real-ip (behind Railway) or none')
  }
  if (role === 'worker') {
    // resend, or an explicit `disabled` (UAT without email: messages dropped, contents never logged).
    // Never capture: it prints whole messages, including verification and reset links, to the logs.
    need('EMAIL_PROVIDER', ['resend', 'disabled'].includes(env.EMAIL_PROVIDER ?? ''), 'must be resend, or disabled to run without email (capture logs message contents)')
    if (env.EMAIL_PROVIDER !== 'disabled') {
      need('RESEND_API_KEY')
      need('EMAIL_FROM')
    }
  }
  if (env.MARKETPLACE_ENABLED === 'true') {
    need('STRIPE_API_KEY', !!(env.STRIPE_API_KEY ?? env.STRIPE_SECRET_KEY))
    if (role === 'api') need('STRIPE_WEBHOOK_SECRET')
  }
  return problems
}

export function assertProductionConfig(role: ProcessRole) {
  const problems = productionConfigProblems(role)
  if (problems.length) {
    throw new Error(`Refusing to start ${role} in production:\n  - ${problems.join('\n  - ')}`)
  }
}
