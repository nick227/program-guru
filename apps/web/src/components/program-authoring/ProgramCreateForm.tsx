import { PROGRAM_DESCRIPTION_MAX } from '@/components/program-authoring/programFields'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useCopyProgram,
  useCreateProgram,
  useCurrentUser,
  useProgramSuggestions,
  useProgramTypes,
  useRenameProgram,
  type components,
} from '@project/sdk'
import { Stack, Row, Grid } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ProgramHeader } from '@/components/program/ProgramHeader'
import { ProgramStepper } from '@/components/program/ProgramStepper'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { SuggestionRail } from '@/components/shared/SuggestionRail'
import { MediaTray } from '@/components/media/MediaTray'
import { useDraftMedia } from '@/lib/useEntityMedia'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import { programCard } from '@/lib/discoveryCards'
import { programHero } from '@/lib/hero'
import { useOnline } from '@/lib/useOnline'

type Program = components['schemas']['ProgramSummary']
type ProgramWorkspace = components['schemas']['ProgramWorkspace']

/** What the form holds before a draft exists; the Add Program page keeps it across the library browser. */
export interface ProgramCreateDraft {
  typeId: string
  title: string
  description: string
  startingPoint: Program | null
}

/**
 * The Add Program form (03-UX §3): Program type, name, cover, description and an optional starting
 * point, then one Continue that creates (or copies) the draft and names it. Shared by the Add Program
 * page and Home's Create a Program builder (03-UX §2a), so there is one way to start a Program.
 */
export function ProgramCreateForm({
  typeId,
  onTypeChange,
  initial,
  onBrowse,
  onCreated,
  loginReturnTo,
}: {
  typeId: string
  onTypeChange: (typeId: string) => void
  initial?: Partial<ProgramCreateDraft> | null
  /** Opens the full Program library; the button is hidden without it. */
  onBrowse?: (snapshot: ProgramCreateDraft) => void
  /** The draft exists and is named; continue to its Activities. */
  onCreated: (programId: string) => void
  loginReturnTo: string
}) {
  const navigate = useNavigate()
  const online = useOnline()
  const me = useCurrentUser()
  const types = useProgramTypes()
  const create = useCreateProgram()
  const copy = useCopyProgram()
  const rename = useRenameProgram()
  const categorySlugOf = useCategorySlugOf()
  const [title, setTitle] = useState(() => initial?.startingPoint?.title ?? initial?.title ?? '')
  const [description, setDescription] = useState(() => initial?.description ?? '')
  const [startingPoint, setStartingPoint] = useState<Program | null>(() => initial?.startingPoint ?? null)
  const [createdDraft, setCreatedDraft] = useState<ProgramWorkspace | null>(null)
  // Chosen before the draft exists; sent bound to it as soon as it is created.
  const cover = useDraftMedia({ multiple: false })
  const [coverError, setCoverError] = useState<unknown>(null)
  const [sendingCover, setSendingCover] = useState(false)
  const type = types.data?.find((item) => item.id === typeId)
  const suggestions = useProgramSuggestions({
    programTypeId: typeId,
    enabled: !!typeId,
  })
  const busy =
    create.isPending || copy.isPending || rename.isPending || sendingCover
  function chooseStartingPoint(program: Program) {
    setStartingPoint(program)
    setTitle(program.title)
    if (program.type.id !== typeId) onTypeChange(program.type.id)
  }
  const error =
    types.error || create.error || copy.error || rename.error || coverError

  async function continueToWorkspace() {
    if (!type || !title.trim() || !online || busy) return
    if (!me.data) {
      navigate(`/login?returnTo=${encodeURIComponent(loginReturnTo)}`)
      return
    }

    try {
      const workspace =
        createdDraft ??
        (startingPoint
          ? await copy.mutateAsync(startingPoint.id)
          : await create.mutateAsync({
              programTypeId: type.id,
              focusId: null,
            }))
      if (!createdDraft) setCreatedDraft(workspace)

      const renamed = await rename.mutateAsync({
        programId: workspace.id,
        title: title.trim(),
        description: description.trim() || undefined,
        expectedRevision: workspace.draftRevision,
      })

      if (cover.files.length) {
        setCoverError(null)
        setSendingCover(true)
        try {
          await cover.commit({
            target: { kind: 'PROGRAM', id: renamed.id },
            purpose: 'COVER',
          })
        } catch (err) {
          setCoverError(err)
          return
        } finally {
          setSendingCover(false)
        }
      }

      onCreated(renamed.id)
    } catch {
      // Mutation errors remain visible below; keep the selection for retry.
    }
  }

  return (
    <>
    <ProgramHeader
      title={title}
      onTitleChange={typeId ? setTitle : undefined}
      autoFocus={!!typeId}
      disabled={busy}
      label={type?.label}
      onConfirm={() => void continueToWorkspace()}
    />
    <ProgramStepper currentStep="details" onSelectStep={() => {}} disabled />

    <ErrorMessage
      error={error}
      retry={types.error ? () => void types.refetch() : undefined}
    />

    {!typeId ? (
      <Stack className="gap-5">
        {types.isPending ? (
          <Loading />
        ) : (
          <Grid className="grid-cols-1 gap-2 sm:grid-cols-2">
            {types.data?.map((item, index) => (
              <Button
                key={item.id}
                variant="outline"
                className="add-program-type"
                onClick={() => {
                  onTypeChange(item.id)
                  setTitle('')
                  setDescription('')
                  setStartingPoint(null)
                }}
              >
                <span className="add-program-type__index">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{item.label}</span>
                <span className="add-program-type__arrow" aria-hidden>
                  ↗
                </span>
              </Button>
            ))}
          </Grid>
        )}
      </Stack>
    ) : (
      <Stack className="gap-5">

        <div className="field">
          <span className="label font-semibold">Cover media</span>
          <MediaTray
            label="Program cover"
            accept="media"
            multiple={false}
            items={cover.items}
            onAdd={cover.add}
            disabled={busy}
          />
        </div>

        <label className="field">
          <span className="label font-semibold">Description</span>
          <textarea
            className="textarea min-h-28"
            maxLength={PROGRAM_DESCRIPTION_MAX}
            value={description}
            placeholder="What is this Program about?"
            disabled={busy}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className="add-program mb-8">
          <Button
            size="lg"
            className="h-11 px-8 font-semibold rounded-lg"
            disabled={!title.trim() || !online || busy}
            loading={busy}
            onClick={() => void continueToWorkspace()}
          >
            {!me.data
              ? 'Sign in to continue'
              : 'Continue'}
          </Button>
        </div>

        <SuggestionRail
          title="Suggested"
          actionLabel="Use as starting point"
          items={suggestions.items.map((program) =>
            programCard(program, categorySlugOf),
          )}
          loading={suggestions.isPending}
          error={suggestions.error}
          retry={() => void suggestions.refetch()}
          selectedId={startingPoint?.id}
          disabled={!!createdDraft}
          onPick={(id) => {
            const program = suggestions.items.find((p) => p.id === id)
            if (program) chooseStartingPoint(program)
          }}
          footer={
            onBrowse && (
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={!!createdDraft}
                aria-label="Browse Program Library"
                onClick={() => onBrowse({ typeId, title, description, startingPoint })}
              >
                Browse
              </Button>
            )
          }
        />
        {startingPoint && (
          <Row className="justify-between gap-3 rounded-lg border border-border p-3">
            <Row className="min-w-0 flex-1 flex-nowrap gap-3">
              <EntityHero
                hero={programHero(startingPoint, categorySlugOf)}
                size="thumb"
              />
              <p className="min-w-0 truncate text-sm">
                Starting point: <strong>{startingPoint.title}</strong>
              </p>
            </Row>
            <Button
              variant="link"
              disabled={!!createdDraft}
              onClick={() => setStartingPoint(null)}
            >
              Remove
            </Button>
          </Row>
        )}
      </Stack>
    )}
    </>
  )
}
