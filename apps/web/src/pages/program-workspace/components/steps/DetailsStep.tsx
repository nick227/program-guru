import {
  formatProgramDuration,
  PROGRAM_DESCRIPTION_MAX,
  PROGRAM_DESCRIPTION_PLACEHOLDER,
  programDescriptionInput,
} from '@/components/program-authoring/programFields'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUpdateProgram } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Panel, Row, Stack } from '@/components/ui/Layout'
import { linkButton } from '@/components/shared/Navigation'
import { ProgramMediaTray } from '@/components/media/EntityMediaTray'
import { useOnline } from '@/lib/useOnline'
import { ProgramDurationButtons } from '@/components/program-authoring/ScheduleControls'
import type { Workspace } from '@/components/program-authoring/types'

export function DetailsStep({
  ws,
  onContinue,
}: {
  ws: Workspace
  onContinue: () => void
}) {
  const update = useUpdateProgram(ws.id)
  const online = useOnline()
  const [description, setDescription] = useState(ws.description ?? '')
  const [savedDesc, setSavedDesc] = useState(ws.description ?? '')
  const [savingDesc, setSavingDesc] = useState(false)
  const [descError, setDescError] = useState<unknown>(null)

  useEffect(() => {
    setDescription(ws.description ?? '')
    setSavedDesc(ws.description ?? '')
  }, [ws.description])

  // Debounced description save
  useEffect(() => {
    if (description === savedDesc || !online || savingDesc) return
    const timer = setTimeout(() => {
      setSavingDesc(true)
      update
        .mutateAsync({
          description: programDescriptionInput(description),
          expectedRevision: ws.draftRevision,
        })
        .then(() => {
          setSavedDesc(description)
          setDescError(null)
        })
        .catch(setDescError)
        .finally(() => setSavingDesc(false))
    }, 600)
    return () => clearTimeout(timer)
  }, [description, savedDesc, online, savingDesc, ws.draftRevision, update])

  return (
    <Stack className="gap-6">
      {/* Program Type Tag */}
      <div className="flex items-center gap-2 text-sm text-muted">
        <span className="font-semibold text-foreground">{ws.type.label}</span>
        {ws.focus && <span>· {ws.focus.label}</span>}
        <span>· {formatProgramDuration(ws.durationDays)}</span>
      </div>

      {/* Cover Image */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Cover Image
        </h3>
        <ProgramMediaTray
          program={ws}
          disabled={ws.status === 'ARCHIVED'}
        />
      </Panel>

      {/* Description */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Description
        </h3>
        <textarea
          className="textarea min-h-28 w-full rounded-lg border border-border p-3 text-sm"
          maxLength={PROGRAM_DESCRIPTION_MAX}
          value={description}
          placeholder={PROGRAM_DESCRIPTION_PLACEHOLDER}
          disabled={!online}
          onChange={(e) => setDescription(e.target.value)}
        />
        {savingDesc && <p className="text-xs text-muted">Saving…</p>}
        <ErrorMessage error={descError} />
      </Panel>

      {/* Duration */}
      <Panel className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Duration
        </h3>
        <ProgramDurationButtons ws={ws} />
      </Panel>

      {/* Consistent Bottom Navigation */}
      <Row className="justify-between items-center pt-6 border-t border-border mt-8">
        <Link to="/library" className={linkButton + ' h-11 px-6 font-semibold'}>
          Back
        </Link>
        <Button
          size="lg"
          className="h-11 px-8 font-semibold"
          onClick={onContinue}
        >
          Continue
        </Button>
      </Row>
    </Stack>
  )
}

