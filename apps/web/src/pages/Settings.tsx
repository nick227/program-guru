import { Link } from 'react-router-dom'
import { useCurrentUser } from '@project/sdk'
import { Page, Stage, Stack, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Back, linkButton } from '@/components/Navigation'
import { toggleTheme } from '@/lib/theme'

export function SettingsPage() {
  const me = useCurrentUser()
  const profile = me.data!.data.profile
  return (
    <Page>
      <Stage>
        <Back to={`/${profile.handle}`}>Profile</Back>
        <h1>Settings</h1>
        <Panel>
          <Stack>
            <h2>Account</h2>
            <p className="text-muted">
              Signed in as {me.data!.data.email} · @{profile.handle}
            </p>
            <Link to={`/${profile.handle}`} className={linkButton}>
              View profile
            </Link>
          </Stack>
        </Panel>
        <Panel>
          <Stack>
            <h2>Appearance</h2>
            <Button variant="outline" onClick={toggleTheme}>
              Toggle light / dark
            </Button>
          </Stack>
        </Panel>
        <Panel>
          <Stack>
            <h2>Reminders</h2>
            <p className="text-muted">
              In-app notifications stay on. Daily email reminder preferences
              will connect here when the worker ships.
            </p>
          </Stack>
        </Panel>
        <Panel>
          <Stack>
            <h2>Billing</h2>
            <p className="text-muted">
              Purchases, subscriptions, and payouts open after billing is
              enabled.
            </p>
          </Stack>
        </Panel>
      </Stage>
    </Page>
  )
}
