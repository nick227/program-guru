import { useOnline } from '@/lib/useOnline'
import { useActivityMedia, useProgramMedia } from '@/lib/useEntityMedia'
import { MediaTray } from './MediaTray'

/** Program cover: one image, replaced by adding another, removed inline. */
export function ProgramMediaTray({
  program,
  disabled = false,
}: {
  program: Parameters<typeof useProgramMedia>[0]
  disabled?: boolean
}) {
  const online = useOnline()
  const media = useProgramMedia(program)
  return (
    <MediaTray
      label="Program cover"
      accept="image"
      multiple={false}
      items={media.items}
      onAdd={media.add}
      disabled={disabled || !online}
    />
  )
}

/** Activity media: every photo and video on the editable revision, in order. */
export function ActivityMediaTray({
  revisionId,
  disabled = false,
}: {
  revisionId: string
  disabled?: boolean
}) {
  const online = useOnline()
  const media = useActivityMedia(revisionId)
  return (
    <MediaTray
      label="Activity media"
      items={media.items}
      onAdd={media.add}
      disabled={disabled || !online}
    />
  )
}
