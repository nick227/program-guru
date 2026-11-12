import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useUnsubscribeDailyEmail } from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/shared/Navigation'
import { useDocumentTitle } from '@/lib/title'

export function UnsubscribePage() {
  useDocumentTitle('Email Preferences')
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const unsubscribe = useUnsubscribeDailyEmail()
  const [completed, setCompleted] = useState(false)
  const autoTriggered = useRef(false)

  useEffect(() => {
    if (!token || autoTriggered.current) return
    autoTriggered.current = true
    unsubscribe
      .mutateAsync({ token })
      .then(() => setCompleted(true))
      .catch(() => {
        /* error displayed below */
      })
  }, [token, unsubscribe])

  return (
    <Page>
      <Stage className="max-w-2xl">
        <Back to="/calendar">Calendar</Back>
        <h1>Email Preferences</h1>
        <Panel>
          <Stack>
            {!token ? (
              <>
                <p className="text-muted">
                  This unsubscribe link is missing a token. You can turn off
                  daily reminder emails anytime in Settings.
                </p>
                <Row>
                  <Link to="/settings#reminders" className={linkButton}>
                    Open Reminder Settings
                  </Link>
                </Row>
              </>
            ) : unsubscribe.isPending ? (
              <Loading />
            ) : completed ? (
              <>
                <h2>Daily reminder emails turned off</h2>
                <p className="text-sm text-muted">
                  You have been unsubscribed from daily reminder emails. You can
                  re-enable them anytime in your Settings.
                </p>
                <Row>
                  <Link to="/calendar" className={linkButton}>
                    Return to Calendar
                  </Link>
                  <Link to="/settings#reminders" className={linkButton}>
                    Reminder Settings
                  </Link>
                </Row>
              </>
            ) : (
              <>
                <ErrorMessage error={unsubscribe.error} />
                <Row>
                  <Button
                    loading={unsubscribe.isPending}
                    onClick={async () => {
                      try {
                        await unsubscribe.mutateAsync({ token })
                        setCompleted(true)
                      } catch {
                        /* error displayed above */
                      }
                    }}
                  >
                    Unsubscribe from daily emails
                  </Button>
                  <Link to="/settings#reminders" className={linkButton}>
                    Manage in Settings
                  </Link>
                </Row>
              </>
            )}
          </Stack>
        </Panel>
      </Stage>
    </Page>
  )
}
