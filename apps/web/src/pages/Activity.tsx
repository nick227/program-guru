import { durationInput, formatDurationMinutes, parseDurationMinutes } from '@/lib/durationMinutes'
import { formatTargetTime, parseTargetTime, targetTimeInput } from '@/lib/targetTime'
import { useEffect, useRef, useState } from 'react'
import {
  Link,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import {
  useActivity,
  useActivityPublicMedia,
  useActivitySuggestions,
  useAddCalendarItem,
  useCategories,
  useCopyActivity,
  useCreateActivity,
  useCurrentUser,
  usePutActivityInstructions,
  useUpdateActivityDraft,
  type components,
} from '@project/sdk'
import { Page, Stage, Stack, Panel } from '@/components/ui/Layout'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/shared/Navigation'
import { ActivityBasicsFields } from '@/components/activity/ActivityBasicsFields'
import { ActivityMediaTray } from '@/components/media/EntityMediaTray'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import {
  buildBrowseUrl,
  clearBrowseDraft,
  readBrowseDraft,
  writeBrowseDraft,
} from '@/pages/Browse'
import { type RiverItem } from '@/components/media/RelatedMedia'
import { ActivityRelatedMedia } from '@/components/activity/ActivityRelatedMedia'
import { SuggestionRail } from '@/components/shared/SuggestionRail'
import { activityCard } from '@/lib/discoveryCards'
import { activityHero } from '@/lib/hero'
import { calendarUrl, isLocalDate, safeReturn, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { useResolveActivityTarget } from '@/lib/useResolveSlug'
import { buildActivityUrl } from '@/lib/urls'
import { ReportButton } from '@/components/shared/ReportButton'

export function ActivityPage() {
  const { id: rawSlugOrId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const resolved = useResolveActivityTarget(rawSlugOrId)
  const activity = useActivity(resolved.activityId)
  const updateTargetTime = useUpdateActivityDraft(resolved.activityId)
  const publicMedia = useActivityPublicMedia(resolved.activityId, undefined, !resolved.notFound && !!resolved.activityId)
  const online = useOnline()
  const [targetTimeDraft, setTargetTimeDraft] = useState('')

  useEffect(() => {
    setTargetTimeDraft(targetTimeInput(activity.data?.targetTime))
  }, [activity.data?.id, activity.data?.targetTime, activity.data?.draftRevision])

  useDocumentTitle(
    activity.data?.title ??
      (resolved.isLoading || activity.isPending
        ? 'Activity'
        : resolved.notFound
          ? 'Activity not found'
          : 'Activity'),
  )

  useEffect(() => {
    if (resolved.isAlias && resolved.canonicalUrl) {
      navigate(resolved.canonicalUrl, { replace: true })
    }
  }, [resolved.isAlias, resolved.canonicalUrl, navigate])

  if (resolved.notFound) {
    return (
      <Page>
        <Stage>
          <Back to={safeReturn(params.get('returnTo'), '/discover')} />
          <h1>Activity not found</h1>
          <p className="text-muted">
            The requested activity does not exist or may have been unpublished.
          </p>
          <Link to="/discover" className="text-accent underline">
            Return to Discovery
          </Link>
        </Stage>
      </Page>
    )
  }

  const rawRiverItems: RiverItem[] = [
    ...(activity.data?.media ?? []).map((m) => ({
      id: m.id,
      thumbnailUrl: m.thumbnailUrl,
      type: m.type,
      alt: m.alt,
      title: activity.data?.title,
    })),
    ...(publicMedia.data?.pages.flatMap((page) => page.data) ?? []).map((pm) => ({
      id: pm.id,
      publicationId: pm.publicationId,
      thumbnailUrl: pm.thumbnailUrl,
      type: pm.type,
      alt: pm.alt,
      title: activity.data?.title,
      credit: pm.creator?.displayName || undefined,
      attribution: pm.attribution || pm.creator?.displayName || undefined,
      license: pm.license || undefined,
    })),
  ]

  const riverItems = Array.from(
    new Map(rawRiverItems.map((item) => [item.id, item])).values(),
  )

  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))} />
        <ErrorMessage
          error={activity.error}
          retry={() => void activity.refetch()}
        />
        {resolved.isLoading || activity.isPending ? (
          <Loading />
        ) : (
          activity.data && (
            <>
              <h1>{activity.data.title}</h1>
              {activity.data.durationMinutes != null && (
                <p className="text-sm font-medium text-muted">
                  Duration: {formatDurationMinutes(activity.data.durationMinutes)}
                </p>
              )}
              {activity.data.targetTime && (
                <p className="text-sm font-medium text-muted">
                  Target time: {formatTargetTime(activity.data.targetTime)}
                </p>
              )}
              {activity.data.canEdit && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="field space-y-1">
                    <span className="label text-xs font-semibold">Target time (optional)</span>
                    <Input
                      type="time"
                      aria-label="Target time (optional)"
                      value={targetTimeDraft}
                      disabled={!online || updateTargetTime.isPending}
                      onChange={(event) => setTargetTimeDraft(event.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      !online ||
                      updateTargetTime.isPending ||
                      parseTargetTime(targetTimeDraft) === (activity.data.targetTime ?? null)
                    }
                    loading={updateTargetTime.isPending}
                    onClick={() =>
                      void updateTargetTime.mutateAsync({
                        targetTime: parseTargetTime(targetTimeDraft),
                        expectedRevision: activity.data!.draftRevision,
                      })
                    }
                  >
                    Save time
                  </Button>
                  {activity.data.targetTime && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!online || updateTargetTime.isPending}
                      onClick={() =>
                        void updateTargetTime.mutateAsync({
                          targetTime: null,
                          expectedRevision: activity.data!.draftRevision,
                        })
                      }
                    >
                      Clear
                    </Button>
                  )}
                  <ErrorMessage error={updateTargetTime.error} />
                </div>
              )}
              <p className="text-muted">{activity.data.summary}</p>
              {!activity.data.canEdit && <ReportButton target={{ type: 'ACTIVITY', id: activity.data.id }} />}
              <Panel>
                <Stack>
                  <h2>Instructions</h2>
                  {activity.data.instructions.map((i) => (
                    <p key={i.id}>{i.body ?? i.title}</p>
                  ))}
                </Stack>
              </Panel>
              <ActivityRelatedMedia activityId={activity.data.id} revisionId={activity.data.canEdit ? activity.data.revisionId : null} items={riverItems} />
              {!!activity.data.metricLabels.filter(
                (label) => !label.toLowerCase().startsWith('duration'),
              ).length && (
                <p className="text-muted">
                  {activity.data.metricLabels
                    .filter(
                      (label) => !label.toLowerCase().startsWith('duration'),
                    )
                    .join(' · ')}
                </p>
              )}
              <p className="text-sm text-muted">
                Session duration is calculated automatically while you work.
              </p>
            </>
          )
        )}
      </Stage>
    </Page>
  )
}

const ACTIVITY_DRAFT_KEY = 'add-activity-browse-draft'

interface AddActivityDraft {
  day: string
  selected: components['schemas']['ActivitySummary'] | null
  title: string
  summary: string
  duration: string
  targetTime: string
  categoryId: string
  instruction: string
}

export function AddActivityPage() {
  const [params] = useSearchParams()
  const me = useCurrentUser()
  const add = useAddCalendarItem()
  const copy = useCopyActivity()
  const create = useCreateActivity()
  const putInstructions = usePutActivityInstructions()
  const update = useUpdateActivityDraft()
  const online = useOnline()
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  const categorySlugOf = useCategorySlugOf()

  useDocumentTitle('Add Activity')

  const routeState = location.state as {
    fromBrowse?: boolean
    pickedActivity?: components['schemas']['ActivitySummary']
  } | null
  const returningFromBrowse = Boolean(routeState?.fromBrowse) || navType === 'POP'
  const [initialDraft] = useState<AddActivityDraft | null>(() =>
    readBrowseDraft<AddActivityDraft>(ACTIVITY_DRAFT_KEY, returningFromBrowse),
  )
  const pickedActivity = routeState?.pickedActivity ?? null
  useEffect(() => {
    if (!returningFromBrowse) clearBrowseDraft(ACTIVITY_DRAFT_KEY)
  }, [returningFromBrowse])

  const [day, setDay] = useState(
    () =>
      initialDraft?.day ??
      params.get('day') ??
      today(
        me.data?.data.preferences.timezone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
  )
  const [selected, setSelected] = useState<
    components['schemas']['ActivitySummary'] | null
  >(() => pickedActivity ?? initialDraft?.selected ?? null)
  const [title, setTitle] = useState(
    () => pickedActivity?.title ?? initialDraft?.title ?? '',
  )
  const [summary, setSummary] = useState(
    () => (pickedActivity ? (pickedActivity.summary ?? '') : initialDraft?.summary ?? ''),
  )
  const [duration, setDuration] = useState(
    () => (pickedActivity ? durationInput(pickedActivity.durationMinutes) : initialDraft?.duration ?? ''),
  )
  const [targetTime, setTargetTime] = useState(
    () => (pickedActivity ? targetTimeInput(pickedActivity.targetTime) : initialDraft?.targetTime ?? ''),
  )
  const categories = useCategories()
  const [categoryId, setCategoryId] = useState(
    () => pickedActivity?.categoryId ?? initialDraft?.categoryId ?? '',
  )
  const [instruction, setInstruction] = useState(
    () => (pickedActivity ? '' : initialDraft?.instruction ?? ''),
  )
  const [createdActivity, setCreatedActivity] = useState<
    components['schemas']['ActivityDetail'] | null
  >(null)
  const [instructionSaved, setInstructionSaved] = useState(false)
  const key = useRef(crypto.randomUUID())
  const suggestions = useActivitySuggestions({ categoryId })

  /** A starting point prefills a private copy; the new-Activity path stays available. */
  function chooseStartingPoint(activity: components['schemas']['ActivitySummary']) {
    setSelected(activity)
    setCreatedActivity(null)
    setInstructionSaved(false)
    setTitle(activity.title)
    setSummary(activity.summary ?? '')
    setDuration(durationInput(activity.durationMinutes))
    setTargetTime(targetTimeInput(activity.targetTime))
    setCategoryId(activity.categoryId)
    setInstruction('')
    key.current = crypto.randomUUID()
  }
  function openBrowser() {
    writeBrowseDraft<AddActivityDraft>(ACTIVITY_DRAFT_KEY, {
      day,
      selected,
      title,
      summary,
      duration,
      targetTime,
      categoryId,
      instruction,
    })
    navigate(
      buildBrowseUrl({
        kind: 'activities',
        facet: categoryId || undefined,
        pick: 'activity',
        returnTo: `${location.pathname}${location.search}`,
      }),
    )
  }

  async function addToCalendar(activityId: string) {
    try {
      const chosenTime = parseTargetTime(targetTime)
      await add.mutateAsync({
        activityId,
        localDate: day,
        ...(chosenTime !== null ? { localTime: chosenTime } : {}),
        idempotencyKey: key.current,
      })
      clearBrowseDraft(ACTIVITY_DRAFT_KEY)
      navigate(calendarUrl(day))
    } catch {
      // Mutation error remains visible; keep the date and Activity for retry.
    }
  }

  async function createActivity() {
    try {
      const nextTargetTime = parseTargetTime(targetTime)
      let created =
        createdActivity ??
        (selected
          ? await copy.mutateAsync({
              activityId: selected.id,
              ...(selected.revisionId
                ? { sourceRevisionId: selected.revisionId }
                : {}),
            })
          : await create.mutateAsync({
              title: title.trim(),
              categoryId,
              focusIds: [],
              summary: summary.trim() || null,
              durationMinutes: parseDurationMinutes(duration),
              targetTime: nextTargetTime,
            }))
      if (!createdActivity) setCreatedActivity(created)

      if (
        created.title !== title.trim() ||
        created.summary !== (summary.trim() || null) ||
        created.durationMinutes !== parseDurationMinutes(duration) ||
        (created.targetTime ?? null) !== nextTargetTime ||
        created.categoryId !== categoryId
      ) {
        created = await update.mutateAsync({
          activityId: created.id,
          ...(created.title !== title.trim() ? { title: title.trim() } : {}),
          ...(created.summary !== (summary.trim() || null)
            ? { summary: summary.trim() || null }
            : {}),
          ...(created.durationMinutes !== parseDurationMinutes(duration)
            ? { durationMinutes: parseDurationMinutes(duration) }
            : {}),
          ...((created.targetTime ?? null) !== nextTargetTime
            ? { targetTime: nextTargetTime }
            : {}),
          ...(created.categoryId !== categoryId ? { categoryId } : {}),
          expectedRevision: created.draftRevision,
        })
        setCreatedActivity(created)
      }

      if (instruction.trim() && !instructionSaved) {
        created = await putInstructions.mutateAsync({
          activityId: created.id,
          instructions: [{ body: instruction.trim() }],
          expectedRevision: created.draftRevision,
        })
        setCreatedActivity(created)
      }
      setInstructionSaved(true)
    } catch {
      // Preserve the draft and form values so the failed step can be retried.
    }
  }


  return (
    <Page>
      <Stage>
        <Back to={safeReturn(params.get('returnTo'))}>Calendar</Back>
        <h1>Add Activity</h1>
        <Panel>
          <Stack>
            {createdActivity ? (
              <>
                <div>
                  <h3 className="font-semibold">{createdActivity.title}</h3>
                  <p className="text-sm text-muted">
                    {createdActivity.summary || 'No description'}
                  </p>
                </div>
                <ErrorMessage
                  error={
                    create.error ||
                    copy.error ||
                    update.error ||
                    putInstructions.error ||
                    add.error
                  }
                />
                {!instructionSaved && (
                  <Button
                    variant="outline"
                    disabled={
                      !online ||
                      create.isPending ||
                      copy.isPending ||
                      update.isPending ||
                      putInstructions.isPending
                    }
                    loading={
                      create.isPending ||
                      copy.isPending ||
                      update.isPending ||
                      putInstructions.isPending
                    }
                    onClick={() => void createActivity()}
                  >
                    {instruction.trim()
                      ? 'Retry saving instructions'
                      : 'Retry saving Activity'}
                  </Button>
                )}
                {createdActivity.revisionId ? (
                  <ActivityMediaTray revisionId={createdActivity.revisionId} />
                ) : (
                  <p className="text-sm text-attention">
                    This Activity has no editable media.
                  </p>
                )}
                <Button
                  disabled={
                    !instructionSaved ||
                    !isLocalDate(day) ||
                    !online ||
                    add.isPending ||
                    create.isPending ||
                    copy.isPending ||
                    update.isPending ||
                    putInstructions.isPending
                  }
                  loading={
                    add.isPending ||
                    copy.isPending ||
                    create.isPending ||
                    update.isPending ||
                    putInstructions.isPending
                  }
                  onClick={() => void addToCalendar(createdActivity.id)}
                >
                  Add to Calendar
                </Button>
              </>
            ) : (
              <>
                <ErrorMessage
                  error={
                    create.error ||
                    copy.error ||
                    update.error ||
                    putInstructions.error
                  }
                />
                <ActivityBasicsFields
                  title={title}
                  summary={summary}
                  duration={duration}
                  targetTime={targetTime}
                  instruction={instruction}
                  onTitleChange={setTitle}
                  onSummaryChange={setSummary}
                  onDurationChange={setDuration}
                  onTargetTimeChange={setTargetTime}
                  onInstructionChange={setInstruction}
                />
                <ErrorMessage
                  error={categories.error}
                  retry={() => void categories.refetch()}
                />
                {categories.isPending ? (
                  <Loading />
                ) : (
                  <label className="field">
                    <span className="label">Category</span>
                    <Select
                      required
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                    >
                      <option value="">Choose a category</option>
                      {categories.data?.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                <Button
                  disabled={
                    !title.trim() ||
                    !categoryId ||
                    !isLocalDate(day) ||
                    !online ||
                    create.isPending ||
                    copy.isPending ||
                    update.isPending ||
                    putInstructions.isPending
                  }
                  loading={
                    create.isPending ||
                    copy.isPending ||
                    update.isPending ||
                    putInstructions.isPending
                  }
                  onClick={() => void createActivity()}
                >
                  {selected ? 'Create a private copy' : 'Create Activity'}
                </Button>
              </>
            )}
          </Stack>
        </Panel>
        <label className="space-y-2">
          Date
          <Input
            type="date"
            value={day}
            onChange={(event) => {
              setDay(event.target.value)
              key.current = crypto.randomUUID()
            }}
          />
        </label>
        <SuggestionRail
          title="Suggestions"
          actionLabel="Use as starting point"
          items={suggestions.items.map((activity) =>
            activityCard(activity, categorySlugOf),
          )}
          loading={suggestions.isPending}
          error={suggestions.error}
          retry={() => void suggestions.refetch()}
          selectedId={selected?.id}
          onPick={(id) => {
            const activity = suggestions.items.find((a) => a.id === id)
            if (activity) chooseStartingPoint(activity)
          }}
          footer={
            <Button variant="outline" className="self-start" onClick={openBrowser}>
              Browse Activity Library
            </Button>
          }
        />
        {selected && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex min-w-0 items-center gap-3">
              <EntityHero hero={activityHero(selected, categorySlugOf)} size="thumb" />
              <p className="min-w-0 truncate text-sm">
                Starting point: <strong>{selected.title}</strong>
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!isLocalDate(day) || !online || add.isPending}
              loading={add.isPending}
              onClick={() => void addToCalendar(selected.id)}
            >
              Use {selected.title} as is
            </Button>
          </div>
        )}
      </Stage>
    </Page>
  )
}
