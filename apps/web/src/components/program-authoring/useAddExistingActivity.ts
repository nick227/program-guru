import {
  useAddProgramActivities,
  useCopyActivity,
  useCurrentUser,
} from '@project/sdk'
import type { ActivitySummary, Workspace } from './types'

export function useAddExistingActivity(ws: Workspace) {
  const me = useCurrentUser()
  const copy = useCopyActivity()
  const add = useAddProgramActivities(ws.id)

  return {
    pending: copy.isPending || add.isPending,
    error: copy.error || add.error,
    run: async (activity: ActivitySummary) => {
      const ownerId = activity.creator?.id
      const id =
        ownerId && ownerId === me.data?.data.id
          ? activity.id
          : (
              await copy.mutateAsync({
                activityId: activity.id,
                ...(activity.revisionId
                  ? { sourceRevisionId: activity.revisionId }
                  : {}),
              })
            ).id
      await add.mutateAsync({ activityIds: [id], expectedRevision: ws.draftRevision })
    },
  }
}

