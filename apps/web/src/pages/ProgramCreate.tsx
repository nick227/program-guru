import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import {
  useCopyProgram,
  useCreateProgram,
  useCurrentUser,
  useProgramSuggestions,
  useProgramTypes,
  useRenameProgram,
  type components,
} from '@project/sdk'
import { Page, Stage, Stack, Row, Grid } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ProgramHeader } from '@/components/ProgramHeader'
import { ProgramStepper } from '@/components/ProgramStepper'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import {
  buildBrowseUrl,
  clearBrowseDraft,
  readBrowseDraft,
  writeBrowseDraft,
} from '@/components/LibraryBrowser'
import { SuggestionRail } from '@/components/SuggestionRail'
import { MediaTray } from '@/components/MediaTray'
import { useDraftMedia } from '@/lib/useEntityMedia'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import { programCard } from '@/lib/discoveryCards'
import { programHero } from '@/lib/hero'
import { safeReturn } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildWorkspaceUrl } from '@/lib/urls'

type Program = components['schemas']['ProgramSummary']
type ProgramWorkspace = components['schemas']['ProgramWorkspace']

const CREATE_DRAFT_KEY = 'program-create-browse-draft'

interface ProgramCreateDraft {
  typeId: string
  title: string
  description: string
  startingPoint: Program | null
}

export function ProgramCreatePage() {
  useDocumentTitle('Add Program')
  const [params, setParams] = useSearchParams()
  const backTo = safeReturn(params.get('returnTo'), '/')
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const online = useOnline()
  const me = useCurrentUser()
  const types = useProgramTypes()
  const create = useCreateProgram()
  const copy = useCopyProgram()
  const rename = useRenameProgram()
  // The chosen type lives in the URL so Back, refresh and the browser keep it.
  const typeId = params.get('type') ?? ''
  const setTypeId = (next: string) =>
    setParams(
      (previous) => {
        const query = new URLSearchParams(previous)
        if (next) query.set('type', next)
        else query.delete('type')
        return query
      },
      { replace: !next },
    )
  const routeState = location.state as {
    fromBrowse?: boolean
    pickedProgram?: Program
  } | null
  const returningFromBrowse = Boolean(routeState?.fromBrowse) || navType === 'POP'
  const [initialDraft] = useState<ProgramCreateDraft | null>(() => {
    const saved = readBrowseDraft<ProgramCreateDraft>(
      CREATE_DRAFT_KEY,
      returningFromBrowse,
    )
    return saved && saved.typeId === typeId ? saved : null
  })
  const pickedProgram = routeState?.pickedProgram ?? null
  useEffect(() => {
    if (!returningFromBrowse) clearBrowseDraft(CREATE_DRAFT_KEY)
  }, [returningFromBrowse])
  useEffect(() => {
    if (pickedProgram && pickedProgram.type.id !== typeId) {
      setTypeId(pickedProgram.type.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedProgram])

  const categorySlugOf = useCategorySlugOf()
  const [title, setTitle] = useState(
    () => pickedProgram?.title ?? initialDraft?.title ?? '',
  )
  const [description, setDescription] = useState(
    () => initialDraft?.description ?? '',
  )
  const [startingPoint, setStartingPoint] = useState<Program | null>(
    () => pickedProgram ?? initialDraft?.startingPoint ?? null,
  )
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
    if (program.type.id !== typeId) setTypeId(program.type.id)
  }
  function openBrowser() {
    writeBrowseDraft<ProgramCreateDraft>(CREATE_DRAFT_KEY, {
      typeId,
      title,
      description,
      startingPoint,
    })
    navigate(
      buildBrowseUrl({
        kind: 'programs',
        type: typeId,
        pick: 'program',
        returnTo: `${location.pathname}${location.search}`,
      }),
    )
  }
  const error =
    types.error || create.error || copy.error || rename.error || coverError

  async function continueToWorkspace() {
    if (!type || !title.trim() || !online || busy) return
    if (!me.data) {
      navigate(`/login?returnTo=${encodeURIComponent('/programs/new')}`)
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

      clearBrowseDraft(CREATE_DRAFT_KEY)
      navigate(buildWorkspaceUrl(renamed.id, { step: 'activities' }), { replace: true })
    } catch {
      // Mutation errors remain visible below; keep the selection for retry.
    }
  }

  return (
    <Page>
      <Stage className="w-full">
        <Back to={backTo}>Calendar</Back>
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
                      clearBrowseDraft(CREATE_DRAFT_KEY)
                      setTypeId(item.id)
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
                maxLength={5000}
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
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  disabled={!!createdDraft}
                  aria-label="Browse Program Library"
                  onClick={openBrowser}
                >
                  Browse
                </Button>
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
      </Stage>
    </Page>
  )
}
