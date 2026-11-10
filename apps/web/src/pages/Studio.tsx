import { Link, useSearchParams } from 'react-router-dom'
import { Page, Stage, Row, Stack } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Back } from '@/components/shared/Navigation'
import { LibraryPanel } from './studio/LibraryPanel'
import { PublishingPanel } from './studio/PublishingPanel'
import { ChannelPanel } from './studio/ChannelPanel'
import { AudiencePanel } from './studio/AudiencePanel'
import { DashboardPanel } from './studio/DashboardPanel'
import { OrganizationPanel } from './studio/OrganizationPanel'
import {
  parseStudioSection,
  studioSections,
  type StudioSection,
} from './studio/sections'
import { useDocumentTitle } from '@/lib/title'

const labels: Record<StudioSection, string> = {
  library: 'Library',
  publishing: 'Publishing',
  channel: 'Channel',
  audience: 'Audience',
  dashboard: 'Dashboard',
  organization: 'Organization',
}

export function StudioPage() {
  const [params, setParams] = useSearchParams()
  const section = parseStudioSection(params.get('section'))
  useDocumentTitle(`Creator Studio · ${labels[section]}`)
  return (
    <Page>
      <Stage className="max-w-7xl">
        <Back to="/">Calendar</Back>
        <Stack>
          <h1>Creator Studio</h1>
          <p className="text-muted">
            Manage channel content, publishing, audience, and earnings. Calendar
            stays your daily home.
          </p>
          <Row aria-label="Studio sections">
            {studioSections.map((id) => (
              <Button
                key={id}
                variant={section === id ? 'default' : 'outline'}
                aria-pressed={section === id}
                onClick={() => setParams({ section: id })}
              >
                {labels[id]}
              </Button>
            ))}
          </Row>
          {section === 'library' && <LibraryPanel />}
          {section === 'publishing' && <PublishingPanel />}
          {section === 'channel' && <ChannelPanel />}
          {section === 'organization' && <OrganizationPanel />}
          {section === 'audience' && <AudiencePanel />}
          {section === 'dashboard' && <DashboardPanel />}
          <p className="text-sm text-muted">
            Need Media upload tools?{' '}
            <Link to="/media" className="text-accent underline">
              Open Media Library
            </Link>
          </p>
        </Stack>
      </Stage>
    </Page>
  )
}
