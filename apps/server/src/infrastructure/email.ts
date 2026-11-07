// Replaceable email delivery (05-ARCHITECTURE.md §11, §15). EMAIL_PROVIDER=resend sends through
// the Resend HTTP API; anything else captures messages in memory and logs them (development, tests).

export type EmailMessage = {
  to: string
  subject: string
  text: string
  html: string
  headers?: Record<string, string>
  /** Provider-side deduplication so a retried outbox event never sends twice. */
  idempotencyKey?: string
}

export interface EmailProvider {
  readonly kind: string
  send(message: EmailMessage): Promise<void>
}

class ResendProvider implements EmailProvider {
  readonly kind = 'resend'
  constructor(private apiKey: string, private from: string) {}
  async send(m: EmailMessage) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(m.idempotencyKey ? { 'idempotency-key': m.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
    })
    if (!res.ok) throw new Error(`Email provider responded ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}

export class CapturingProvider implements EmailProvider {
  readonly kind = 'capture'
  readonly sent: EmailMessage[] = []
  async send(m: EmailMessage) {
    if (m.idempotencyKey && this.sent.some((s) => s.idempotencyKey === m.idempotencyKey)) return
    this.sent.push(m)
    if (process.env.NODE_ENV !== 'test') console.log(`[email] to=${m.to} subject="${m.subject}"\n${m.text}\n`)
  }
}

let provider: EmailProvider | null = null

export function email(): EmailProvider {
  if (provider) return provider
  if (process.env.EMAIL_PROVIDER === 'resend') {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend')
    provider = new ResendProvider(process.env.RESEND_API_KEY, process.env.EMAIL_FROM)
  } else {
    provider = new CapturingProvider()
  }
  return provider
}

export function setEmailProvider(p: EmailProvider) {
  provider = p
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain, accessible layout: one heading, short text, one action. No tracking pixels. */
export function layout(opts: { heading: string; lines: string[]; action?: { label: string; url: string }; footer?: string }) {
  const text = [opts.heading, '', ...opts.lines, ...(opts.action ? ['', `${opts.action.label}: ${opts.action.url}`] : []), ...(opts.footer ? ['', opts.footer] : [])].join('\n')
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escape(opts.heading)}</h1>
${opts.lines.map((l) => `<p>${escape(l)}</p>`).join('\n')}
${opts.action ? `<p><a href="${escape(opts.action.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:8px;text-decoration:none">${escape(opts.action.label)}</a></p>` : ''}
${opts.footer ? `<p style="font-size:12px;color:#666">${escape(opts.footer)}</p>` : ''}
</body></html>`
  return { text, html }
}
