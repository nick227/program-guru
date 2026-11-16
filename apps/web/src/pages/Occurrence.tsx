import { useParams } from 'react-router-dom'
import { useOccurrence } from '@project/sdk'
import { Page } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { ActivityPage } from './Activity'

/** Legacy calendar links resolve into the same Activity page. */
export function OccurrencePage() {
  const { id = '' } = useParams()
  const occurrence = useOccurrence(id)
  return occurrence.data ? (
    <ActivityPage activityId={occurrence.data.item.activityId} occurrence={occurrence.data} refreshOccurrence={() => void occurrence.refetch()} />
  ) : (
    <Page><ErrorMessage error={occurrence.error} retry={() => void occurrence.refetch()} />{occurrence.isPending && <Loading />}</Page>
  )
}
