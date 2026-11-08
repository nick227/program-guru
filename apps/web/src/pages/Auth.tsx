// Account screens around the existing session API (06-USERS.md): registration, email verification,
// and password reset. Session handling is unchanged: register signs in (cookie), reset signs out
// everywhere server-side and the client cache is cleared by the SDK hooks.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import {
  ApiError,
  useCurrentUser,
  useForgotPassword,
  useRegister,
  useResendVerification,
  useResetPassword,
  useVerifyEmail,
} from '@project/sdk'
import { Page, Panel, Stage } from '@/components/ui/Layout'
import { Form } from '@/components/ui/Form'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { safeReturn } from '@/lib/dates'

const fieldErrors = (error: unknown) => (error instanceof ApiError ? error.fieldErrors : undefined)
const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
  } catch {
    return undefined
  }
}

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Page>
      <Stage>
        <p className="font-display text-muted">Programs</p>
        <h1>{title}</h1>
        {children}
      </Stage>
    </Page>
  )
}

// ── Registration ────────────────────────────────────────────────────────────

const registerSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter your name').max(80),
  handle: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$/, '3–30 letters, numbers, dots, dashes or underscores; start with a letter or number'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

export function RegisterPage() {
  const register = useRegister()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const returnTo = safeReturn(params.get('returnTo'))
  return (
    <AuthShell title="Create your account">
      <Panel>
        <Form
          schema={registerSchema}
          fields={[
            { name: 'displayName', label: 'Name', type: 'text', required: true },
            { name: 'handle', label: 'Handle', type: 'text', required: true, placeholder: 'your-handle' },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'password', label: 'Password', type: 'password', required: true },
          ]}
          submitLabel="Create account"
          isLoading={register.isPending}
          serverErrors={fieldErrors(register.error)}
          onSubmit={async (body) => {
            try {
              await register.mutateAsync({ ...body, timezone: browserTimezone() })
              navigate(`/verify-email?sent=1&returnTo=${encodeURIComponent(returnTo)}`, { replace: true })
            } catch {
              /* shown below; keep input */
            }
          }}
        />
        <ErrorMessage error={register.error} />
      </Panel>
      <p>
        Already have an account?{' '}
        <Link to={`/login${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`} className="text-accent underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

// ── Email verification ──────────────────────────────────────────────────────

/** Resend control for a signed-in, unverified user. */
function ResendVerification() {
  const resend = useResendVerification()
  return (
    <div className="space-y-2">
      <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending || resend.isSuccess}>
        {resend.isSuccess ? 'Link sent' : resend.isPending ? 'Sending…' : 'Send a new link'}
      </Button>
      {resend.isSuccess && <p role="status">Check your inbox. The new link replaces earlier ones.</p>}
      <ErrorMessage error={resend.error} />
    </div>
  )
}

/** /verify-email?token=… consumes the emailed link; without a token it shows the verification-required state. */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const returnTo = safeReturn(params.get('returnTo'))
  const me = useCurrentUser()
  const verify = useVerifyEmail()
  // Tokens are single-use: post once even if React mounts the effect twice in development.
  const sent = useRef(false)
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true
      verify.mutate(token)
    }
  }, [token, verify])

  const signedIn = me.isSuccess
  const verified = me.data?.data.emailVerified === true

  if (token) {
    if (verify.isPending || verify.isIdle) {
      return (
        <AuthShell title="Confirming your email">
          <Loading />
        </AuthShell>
      )
    }
    // A link opened twice (or after verifying elsewhere) is still a success for a verified viewer.
    if (verify.isSuccess || verified) {
      return (
        <AuthShell title="Email confirmed">
          <Panel className="space-y-3">
            <p role="status">Your email is confirmed. You can now publish Programs and Activities.</p>
            <Link to={signedIn ? returnTo : '/login'} className="text-accent underline">
              {signedIn ? 'Continue' : 'Sign in'}
            </Link>
          </Panel>
        </AuthShell>
      )
    }
    return (
      <AuthShell title="This link can't be used">
        <Panel className="space-y-3">
          <p role="alert">
            {verify.error instanceof ApiError && verify.error.status === 400
              ? `${verify.error.message}. Verification links work once and expire after 48 hours.`
              : 'We could not confirm your email right now.'}
          </p>
          {verify.error instanceof ApiError && verify.error.status !== 400 && <ErrorMessage error={verify.error} />}
          {signedIn ? (
            <ResendVerification />
          ) : (
            <p>
              <Link to={`/login?returnTo=${encodeURIComponent('/verify-email')}`} className="text-accent underline">
                Sign in
              </Link>{' '}
              to get a new link.
            </p>
          )}
        </Panel>
      </AuthShell>
    )
  }

  if (me.isPending) {
    return (
      <AuthShell title="Confirm your email">
        <Loading />
      </AuthShell>
    )
  }
  if (!signedIn) {
    return (
      <AuthShell title="Confirm your email">
        <Panel className="space-y-3">
          <p>Open the confirmation link we emailed you. To get a new one, sign in first.</p>
          <Link to={`/login?returnTo=${encodeURIComponent('/verify-email')}`} className="text-accent underline">
            Sign in
          </Link>
        </Panel>
      </AuthShell>
    )
  }
  if (verified) {
    return (
      <AuthShell title="Email confirmed">
        <Panel className="space-y-3">
          <p role="status">Your email is already confirmed.</p>
          <Link to={returnTo} className="text-accent underline">
            Continue
          </Link>
        </Panel>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Confirm your email">
      <Panel className="space-y-3">
        <p role="status">
          {params.get('sent') ? 'Your account is ready. ' : ''}We sent a confirmation link to <strong>{me.data?.data.email}</strong>.
          Confirming is required before you publish Programs or Activities; everything else works now.
        </p>
        <ResendVerification />
        <Link to={returnTo} className="text-accent underline">
          Continue to your calendar
        </Link>
      </Panel>
    </AuthShell>
  )
}

// ── Password reset ──────────────────────────────────────────────────────────

const forgotSchema = z.object({ email: z.string().email('Enter a valid email') })

export function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const [sentTo, setSentTo] = useState<string | null>(null)
  return (
    <AuthShell title="Reset your password">
      <Panel className="space-y-3">
        {sentTo ? (
          // Same answer whether or not the address has an account (the API never reveals it).
          <p role="status">
            If an account uses <strong>{sentTo}</strong>, a reset link is on its way. It works once and expires in one hour.
          </p>
        ) : (
          <>
            <p>Enter your account email and we&apos;ll send a link to choose a new password.</p>
            <Form
              schema={forgotSchema}
              fields={[{ name: 'email', label: 'Email', type: 'email', required: true }]}
              submitLabel="Send reset link"
              isLoading={forgot.isPending}
              serverErrors={fieldErrors(forgot.error)}
              onSubmit={async (body) => {
                try {
                  await forgot.mutateAsync(body)
                  setSentTo(body.email)
                } catch {
                  /* shown below */
                }
              }}
            />
            <ErrorMessage error={forgot.error} />
          </>
        )}
      </Panel>
      <Link to="/login" className="text-accent underline">
        Back to sign in
      </Link>
    </AuthShell>
  )
}

const resetSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const reset = useResetPassword()

  const invalid = (message: string) => (
    <AuthShell title="This link can't be used">
      <Panel className="space-y-3">
        <p role="alert">{message}</p>
        <Link to="/forgot-password" className="text-accent underline">
          Request a new reset link
        </Link>
      </Panel>
    </AuthShell>
  )

  if (!token) return invalid('This reset link is missing its code. Open the link from your email again.')
  if (reset.isSuccess) {
    return (
      <AuthShell title="Password changed">
        <Panel className="space-y-3">
          <p role="status">Your password is changed and you were signed out everywhere. Sign in with your new password.</p>
          <Link to="/login" className="text-accent underline">
            Sign in
          </Link>
        </Panel>
      </AuthShell>
    )
  }
  if (reset.error instanceof ApiError && reset.error.status === 400 && reset.error.fieldErrors?.token) {
    return invalid(`${reset.error.message}. Reset links work once and expire after one hour.`)
  }
  return (
    <AuthShell title="Choose a new password">
      <Panel>
        <Form
          schema={resetSchema}
          fields={[
            { name: 'password', label: 'New password', type: 'password', required: true },
            { name: 'confirm', label: 'Confirm new password', type: 'password', required: true },
          ]}
          submitLabel="Change password"
          isLoading={reset.isPending}
          serverErrors={fieldErrors(reset.error)}
          onSubmit={async ({ password }) => {
            try {
              await reset.mutateAsync({ token, password })
            } catch {
              /* shown below or as the invalid-link state */
            }
          }}
        />
        <ErrorMessage error={reset.error} />
      </Panel>
    </AuthShell>
  )
}
