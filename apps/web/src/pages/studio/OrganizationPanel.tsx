import { Link } from 'react-router-dom'
import { useMyPrograms } from '@project/sdk'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/shared/Navigation'
import { buildProgramUrl } from '@/lib/urls'

/** Catalog preview until Featured/Collection APIs exist — no local fake featured order. */
export function OrganizationPanel() {
  const programs = useMyPrograms('PUBLISHED')
  const rows = programs.data?.pages.flatMap((page) => page.data) ?? []
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Organization</h2>
          <p className="text-sm text-muted">
            Featured order, curated sections, and collections need
            ChannelFeaturedItem / Collection contracts. Showing recent published
            Programs as the public catalog stand-in.
          </p>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <h3>Public catalog (recent)</h3>
          <ErrorMessage
            error={programs.error}
            retry={() => void programs.refetch()}
          />
          {programs.isPending ? <Loading /> : null}
          {!programs.error && !rows.length && !programs.isPending ? (
            <p>No published Programs yet.</p>
          ) : null}
          {rows.slice(0, 6).map((program) => (
            <Row key={program.id} className="justify-between">
              <span className="truncate font-medium">{program.title}</span>
              <Link to={buildProgramUrl(program)} className={linkButton}>
                Preview
              </Link>
            </Row>
          ))}
        </Stack>
      </Panel>
    </Stack>
  )
}
