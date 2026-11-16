import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Row } from '@/components/ui/Layout'
import { Back } from '@/components/shared/Navigation'
import { buildProgramUrl } from '@/lib/urls'
import type { Workspace } from '@/components/program-authoring/types'

export function WorkspaceHeader({
  ws,
  panelParam,
}: {
  ws: Workspace
  panelParam: string | null
}) {
  const base = `/programs/${ws.id}/workspace`

  return (
    <Row className="justify-between items-center">
      <Back to={panelParam ? base : '/library'}>
        {panelParam ? 'Workspace' : 'My Programs'}
      </Back>
    </Row>
  )
}

