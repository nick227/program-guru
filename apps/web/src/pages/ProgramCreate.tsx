import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  useCopyProgram,
  useCreateProgram,
  useCurrentUser,
  useDiscoverPrograms,
  useProgramTypes,
  useRenameProgram,
  type components,
} from '@project/sdk'
import { Page, Stage, Stack, Row, Grid, Panel } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { safeReturn } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildWorkspaceUrl } from '@/lib/urls'

type Program = components['schemas']['ProgramSummary']
type ProgramWorkspace = components['schemas']['ProgramWorkspace']

export function ProgramCreatePage() {
  useDocumentTitle('Add a Program')
  const [params] = useSearchParams()
  const backTo = safeReturn(params.get('returnTo'), '/')
  const navigate = useNavigate()
  const online = useOnline()
  const me = useCurrentUser()
  const types = useProgramTypes()
  const create = useCreateProgram()
  const copy = useCopyProgram()
  const rename = useRenameProgram()
  const [typeId, setTypeId] = useState('')
  const [title, setTitle] = useState('')
  const [startingPoint, setStartingPoint] = useState<Program | null>(null)
  const [createdDraft, setCreatedDraft] = useState<ProgramWorkspace | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [searchTitle, setSearchTitle] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTitle(title.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [title])

  const programs = useDiscoverPrograms(searchTitle, typeId)
  const type = types.data?.find((item) => item.id === typeId)
  const suggestions =
    programs.data?.pages.flatMap((page) =>
      page.data.flatMap((item) => (item.program ? [item.program] : [])),
    ) ?? []
  const busy = create.isPending || copy.isPending || rename.isPending
  const error = types.error || programs.error || create.error || copy.error || rename.error

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
        expectedRevision: workspace.draftRevision,
      })

      navigate(buildWorkspaceUrl(renamed.id), { replace: true })
    } catch {
      // Mutation errors remain visible below; keep the selection for retry.
    }
  }

  return (
    <Page>
      <Stage className="max-w-3xl">
        <Back to={backTo}>Calendar</Back>
        <header className="add-program-heading">
          <div className="add-program-heading__copy">
            <p className="page-kicker">Your next Program</p>
            <h1 className="page-title">Add a Program</h1>
          </div>
          <p className="add-program-step" aria-live="polite">
            <span>{typeId ? '02' : '01'}</span> / 03
          </p>
        </header>
        <div
          className="add-program-progress"
          role="progressbar"
          aria-label="Add a Program"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={typeId ? 2 : 1}
        >
          <span className={typeId ? 'add-program-progress__fill is-wide' : 'add-program-progress__fill'} />
        </div>

        <ErrorMessage
          error={error}
          retry={
            types.error
              ? () => void types.refetch()
              : programs.error
                ? () => void programs.refetch()
                : undefined
          }
        />

        {!typeId ? (
          <Stack className="gap-5">
            <div>
              <p className="page-kicker">01 · Classify your plan</p>
              <h2 className="add-program-question">What kind of Program?</h2>
              <p className="mt-2 text-muted">
                Pick a type to see useful starting points. You can customize
                everything next.
              </p>
            </div>
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
                      setTypeId(item.id)
                      setTitle('')
                      setStartingPoint(null)
                      setShowMore(false)
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
            <Row className="justify-between">
              <div>
                <p className="page-kicker">02 · Name or start from a template</p>
                <h2 className="add-program-question">What is your Program?</h2>
              </div>
              <Button
                variant="ghost"
                disabled={busy || !!createdDraft}
                onClick={() => {
                  setTypeId('')
                  setTitle('')
                  setStartingPoint(null)
                  setCreatedDraft(null)
                }}
              >
                Change type
              </Button>
            </Row>

            <div className="add-program-title">
              <span className="add-program-title__type">{type?.label}</span>
              <label className="space-y-2">
                <span className="text-sm font-semibold">Program name</span>
                <Input
                  autoFocus
                  maxLength={140}
                  value={title}
                  placeholder="Give it a name you can change later"
                  onChange={(event) => {
                    setTitle(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && title.trim()) {
                      event.preventDefault()
                      void continueToWorkspace()
                    }
                  }}
                />
              </label>
            </div>

            <div className="add-program-suggestions">
              <Row className="items-end justify-between">
                <div>
                  <p className="page-kicker">
                    {title.trim() ? 'Matching starting points' : 'A few places to start'}
                  </p>
                  <h3 className="text-lg font-semibold">
                    Starting points <span className="font-normal text-muted">· {type?.label}</span>
                  </h3>
                </div>
                {programs.isFetching && !programs.isPending && (
                  <span className="text-xs text-muted">Updating…</span>
                )}
              </Row>
              {programs.isPending ? (
                <Loading />
              ) : suggestions.length ? (
                <>
                  <Grid className="grid-cols-1 gap-2 sm:grid-cols-2">
                    {suggestions.slice(0, showMore ? undefined : 4).map((program, index) => {
                      const selected = startingPoint?.id === program.id
                      return (
                        <button
                          key={program.id}
                          type="button"
                          disabled={!!createdDraft}
                          aria-pressed={selected}
                          className={`add-program-suggestion${selected ? ' is-selected' : ''}`}
                          onClick={() => {
                            if (createdDraft) return
                            setStartingPoint(program)
                            setTitle(program.title)
                          }}
                        >
                          <span className="add-program-suggestion__index">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="add-program-suggestion__body">
                            <strong>{program.title}</strong>
                            <span>
                              {program.focus?.label ? `${program.focus.label} · ` : ''}
                              {program.frequencyLabel || 'Flexible schedule'}
                              {program.durationDays
                                ? ` · ${Math.ceil(program.durationDays / 7)} wk`
                                : ''}
                            </span>
                          </span>
                          <span className="add-program-suggestion__check" aria-hidden>
                            {selected ? '✓' : '+'}
                          </span>
                        </button>
                      )
                    })}
                  </Grid>
                  {programs.hasNextPage && (
                    <Button
                      variant="link"
                      loading={programs.isFetchingNextPage}
                      onClick={async () => {
                        if (!showMore) setShowMore(true)
                        await programs.fetchNextPage()
                      }}
                    >
                      More starting points
                    </Button>
                  )}
                </>
              ) : (
                <Panel className="panel--quiet">
                  <p className="text-sm text-muted">
                    No matching starting points. Continue with a blank Program,
                    or try a shorter title.
                  </p>
                </Panel>
              )}
              {startingPoint && (
                <Button
                  variant="link"
                  className="self-start"
                  disabled={!!createdDraft}
                  onClick={() => setStartingPoint(null)}
                >
                  Start with a blank structure instead
                </Button>
              )}
            </div>

            <div className="add-program-footer">
              <p className="text-sm text-muted">
                {startingPoint
                  ? 'You’ll get your own editable copy. The original stays unchanged.'
                  : 'Start with an empty structure. Add Activities and a schedule next.'}
              </p>
              <Button
                size="lg"
                disabled={!title.trim() || !online || busy}
                loading={busy}
                onClick={() => void continueToWorkspace()}
              >
                {!me.data
                  ? 'Sign in to continue'
                  : startingPoint
                    ? 'Use this starting point'
                    : 'Create Program'}
              </Button>
            </div>
          </Stack>
        )}
      </Stage>
    </Page>
  )
}
