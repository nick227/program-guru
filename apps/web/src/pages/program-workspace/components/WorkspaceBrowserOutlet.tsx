import { Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { LibraryBrowserContext } from '@/components/LibraryBrowser'
import { useAddExistingActivity } from '../hooks/useAddExistingActivity'
import type { Workspace } from '../types'

export function WorkspaceBrowserOutlet({ ws }: { ws: Workspace }) {
  const addExisting = useAddExistingActivity(ws)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const step = params.get('step') ?? 'activities'

  const context: LibraryBrowserContext = {
    kind: 'activities',
    categoryId: ws.type.categoryId || undefined,
    exclude: ws.activities.map((a) => a.activityId),
    actionLabel: 'Add to Program',
    onPick: (activity) => {
      void addExisting
        .run(activity)
        .then(() => {
          toast.success('Activity added')
          navigate(`/programs/${ws.id}/workspace?step=${step}`)
        })
        .catch((error: unknown) =>
          toast.error(
            error instanceof Error
              ? error.message
              : 'Could not add the Activity',
          ),
        )
    },
  }

  return <Outlet context={context} />
}

