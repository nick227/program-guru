import { useCurrentUser, useMyEnrollments } from '@project/sdk'
import { ProgramGroups } from '@/components/ProgramGroups'
import type { Workspace } from '@/components/program-authoring/types'

export function WorkspaceTogether({ ws }: { ws: Workspace }) {
  const me = useCurrentUser()
  const enrollments = useMyEnrollments()
  const enrollment = enrollments.data?.pages.flatMap((page) => page.data).find(
    (entry) => entry.program.id === ws.id && ['ACTIVE', 'PAUSED'].includes(entry.status),
  )

  return (
    <ProgramGroups
      key={ws.latestPublishedVersionId}
      programId={ws.id}
      versionId={ws.latestPublishedVersionId}
      enrollmentId={enrollment?.id ?? null}
      isProgramOwner
      timezone={me.data?.data.preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
      title={null}
    />
  )
}

