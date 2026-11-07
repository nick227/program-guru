import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, useLogin } from '@project/sdk'
import { z } from 'zod'
import { Page, Stage, Panel } from '@/components/ui/Layout'
import { Form } from '@/components/ui/Form'
import { ErrorMessage } from '@/components/ui/Feedback'
import { safeReturn } from '@/lib/dates'
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password'),
})
export function LoginPage() {
  const login = useLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  return (
    <Page>
      <Stage>
        <p className="font-display text-muted">Programs</p>
        <h1>Sign in to your week</h1>
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
        <Link to="/discover" className="text-accent underline">
          Browse Programs
        </Link>
      </Stage>
    </Page>
  )
}
