import { Link, useSearchParams } from 'react-router-dom'
import { useDiscoverPrograms, useMyPrograms } from '@project/sdk'
import { Page, Stack, Row, Panel } from '@/components/ui/Layout'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { safeReturn } from '@/lib/dates'
export function DiscoverPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const programs = useDiscoverPrograms(q)
  const origin = safeReturn(params.get('returnTo'))
  const rows =
    programs.data?.pages.flatMap((page) =>
      page.data.flatMap((item) => (item.program ? [item.program] : [])),
    ) ?? []
  return (
    <Page>
      <Stack>
        <Back to={origin}>Calendar</Back>
        <Row className="justify-between">
          <div>
            <h1>Find your next Program</h1>
            <p className="mt-2 text-muted">
              Choose a starting point for your week.
            </p>
          </div>
          <Link className={linkButton} to="/programs/new">
            Create Program
          </Link>
        </Row>
        <label className="space-y-2">
          <span className="text-xs text-muted">Search Programs</span>
          <Input
            type="search"
            value={q}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              next.set('q', e.target.value)
              setParams(next, { replace: true })
            }}
          />
        </label>
        <ErrorMessage
          error={programs.error}
          retry={() => void programs.refetch()}
        />
        {programs.isPending ? (
          <Loading />
        ) : (
          rows.map((program) => (
            <Link
              key={program.id}
              to={`/programs/${program.id}?returnTo=${encodeURIComponent('/discover?' + params.toString())}`}
            >
              <Panel className="transition-colors hover:border-accent">
                <Row className="justify-between">
                  <Stack className="gap-2">
                    <p className="text-xs text-muted">
                      {program.isPlatform
                        ? 'Platform library'
                        : program.creator?.displayName}{' '}
                      · {program.type.label}
                    </p>
                    <h2 className="font-display text-lg">{program.title}</h2>
                    <p className="text-muted">
                      {program.frequencyLabel} ·{' '}
                      {program.durationDays
                        ? `${program.durationDays} days`
                        : 'Ongoing'}
                    </p>
                  </Stack>
                  <span className="text-xs text-muted">
                    {program.accessMode === 'OPEN' ? 'Free' : 'Access required'}
                  </span>
                </Row>
              </Panel>
            </Link>
          ))
        )}
        {!programs.isPending && !programs.error && rows.length === 0 && (
          <Panel>
            <p>No Programs found.</p>
            <Link
              to="/programs/new"
              className="mt-4 inline-block text-accent underline"
            >
              Create Program
            </Link>
          </Panel>
        )}
        {programs.hasNextPage && (
          <Button
            variant="outline"
            loading={programs.isFetchingNextPage}
            onClick={() => void programs.fetchNextPage()}
          >
            Load more
          </Button>
        )}
      </Stack>
    </Page>
  )
}
export function LibraryPage() {
  const programs = useMyPrograms()
  const rows = programs.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Page>
      <Stack>
        <Back to="/">Calendar</Back>
        <Row className="justify-between">
          <h1>My Programs</h1>
          <Link to="/programs/new" className={linkButton}>
            Create Program
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
            <Link key={program.id} to={`/programs/${program.id}/workspace`}>
              <Panel>
                <h2>{program.title}</h2>
                <p className="mt-2 text-muted">
                  {program.type.label} · Continue editing
                </p>
              </Panel>
            </Link>
          ))
        )}
        {!programs.isPending && !rows.length && <p>No Programs yet.</p>}
        {programs.hasNextPage && (
          <Button onClick={() => void programs.fetchNextPage()}>
            Load more
          </Button>
        )}
      </Stack>
    </Page>
  )
}
