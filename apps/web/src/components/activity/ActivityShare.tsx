import { Share2 } from 'lucide-react'
import type { components } from '@project/sdk'
import { ShareLinkField } from '@/components/social/ShareLink'
import { buildActivityUrl, toAbsoluteUrl } from '@/lib/urls'
import { ActivitySection } from './ActivitySection'

type Activity = components['schemas']['ActivityDetail']

/** The Activity's own public page, when others can open it; otherwise why not. */
export function ActivityShare({
  activity,
  loading = false,
  locked = false,
}: {
  activity?: Activity
  loading?: boolean
  locked?: boolean
}) {
  const shareable =
    !!activity && activity.status === 'PUBLISHED' && activity.visibility !== 'PRIVATE'
  const note = locked
    ? 'This Activity is part of a Program you no longer have access to, so it has no share link.'
    : loading
      ? 'Loading share link…'
      : activity?.canEdit
        ? 'This Activity is private or unpublished. Make it public to share a link.'
        : 'This Activity is private, so there is no public link to share.'
  return (
    <ActivitySection
      icon={Share2}
      title="Share"
      className="activity-share"
      description={shareable ? 'Invite others to try this Activity.' : note}
    >
      {shareable && (
        <ShareLinkField
          url={toAbsoluteUrl(buildActivityUrl(activity))}
          shareTitle={activity.title}
          copiedMessage="Activity link copied"
          inputLabel="Activity link"
        />
      )}
    </ActivitySection>
  )
}
