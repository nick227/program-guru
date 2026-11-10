import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, useLogin } from '@project/sdk'
import { z } from 'zod'
import { Page, Stage, Panel } from '@/components/ui/Layout'
import { Form } from '@/components/ui/Form'
import { ErrorMessage } from '@/components/ui/Feedback'
import { safeReturn } from '@/lib/dates'
import { useDocumentTitle } from '@/lib/title'
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password'),
})
export function LoginPage() {
  useDocumentTitle('Sign in')
  const login = useLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return (
    <Page>
      <Stage className="max-w-xl flex flex-col justify-start h-screen">
        <h1 className='page-title text-4xl'>Login bruh.</h1>
        <Panel>
          <Form
            schema={schema}
            fields={[
              { name: 'email', label: 'Email', type: 'email', required: true },
              {
                name: 'password',
                label: 'Password',
                type: 'password',
                required: true,
              },
            ]}
            submitLabel="Sign in"
            isLoading={login.isPending}
            serverErrors={
              login.error instanceof ApiError
                ? login.error.fieldErrors
                : undefined
            }
            onSubmit={async (body) => {
              try {
                await login.mutateAsync(body)
                navigate(safeReturn(params.get('returnTo')), { replace: true })
              } catch {
                /* shown below; keep input */
              }
            }}
          />
          <ErrorMessage error={login.error} />
        </Panel>
        <p className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            to={`/register${params.get('returnTo') ? `?returnTo=${encodeURIComponent(safeReturn(params.get('returnTo')))}` : ''}`}
            className="text-accent underline"
          >
            Create account
          </Link>
          <Link to="/forgot-password" className="text-accent underline">
            Forgot password?
          </Link>
        </p>
      </Stage>
    </Page>
  )
}
