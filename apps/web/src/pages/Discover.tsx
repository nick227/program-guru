import { Link } from 'react-router-dom'
import { useMyPrograms } from '@project/sdk'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { useDocumentTitle } from '@/lib/title'
import { buildWorkspaceUrl } from '@/lib/urls'

export function LibraryPage() {
  useDocumentTitle('My Programs')
  const programs = useMyPrograms()
  const rows = programs.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Page>
      <Stack>
        <Back to="/">Calendar</Back>
        <Row className="justify-between">
          <div>
            <h1>My Programs</h1>
            <p className="mt-2 text-muted">
              Your Programs, ready to keep shaping.
            </p>
          </div>
          <Link
            to="/programs/new?returnTo=%2Flibrary"
            className={linkButton}
          >
            Add a Program
          </Link>
        </Row>
        <ErrorMessage
          error={programs.error}
          retry={() => void programs.refetch()}
        />
        {programs.isPending ? (
          <Loading />
        ) : (
          rows.map((program) => (
            <Link key={program.id} to={buildWorkspaceUrl(program.id)}>
              <Panel>
                <h2>{program.title}</h2>
                <p className="mt-2 text-muted">
                  {program.type.label}
                  {program.focus ? ` · ${program.focus.label}` : ''}
                  {program.frequencyLabel ? ` · ${program.frequencyLabel}` : ''}
                </p>
              </Panel>
            </Link>
          ))
        )}
        {!programs.isPending && !programs.error && !rows.length && (
          <Panel className="panel--quiet">
            <Stack className="items-start">
              <h2>Your Programs start here</h2>
              <p className="text-muted">
                Pick a Program type, choose a starting point, or begin with a
                blank structure.
              </p>
              <Link
                to="/programs/new?returnTo=%2Flibrary"
                className={linkButton}
              >
                Add a Program
              </Link>
            </Stack>
          </Panel>
        )}
        {programs.hasNextPage && (
          <Button onClick={() => void programs.fetchNextPage()}>
            Load more
          </Button>
        )}
      </Stack>
    </Page>
  )
}
