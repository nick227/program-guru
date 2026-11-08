import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import { Back } from '@/components/Navigation'
import { ActivityBasicsFields } from '@/components/ActivityBasicsFields'
import { ChangeImage } from '@/components/ChangeImage'
import { EntityHero, useCategorySlugOf } from '@/components/EntityHero'
import {
  useLibraryBrowser,
  type LibraryBrowserContext,
} from '@/components/LibraryBrowser'
import { RelatedMediaRiver, type RiverItem } from '@/components/RelatedMediaRiver'
import { SuggestionRail } from '@/components/SuggestionRail'
import { activityCard } from '@/lib/discoveryCards'
import { activityHero } from '@/lib/hero'
import { useActivityCover } from '@/lib/useEntityCover'
import { calendarUrl, isLocalDate, safeReturn, today } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { useResolveActivityTarget } from '@/lib/useResolveSlug'
import { buildActivityUrl } from '@/lib/urls'

export function ActivityPage() {
  const { id: rawSlugOrId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const resolved = useResolveActivityTarget(rawSlugOrId)
  const activity = useActivity(resolved.activityId)
  const publicMedia = useActivityPublicMedia(resolved.activityId, undefined, !resolved.notFound && !!resolved.activityId)

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
              <p className="text-muted">{activity.data.summary}</p>
              <Panel>
                <Stack>
                  <h2>Instructions</h2>
                  {activity.data.instructions.map((i) => (
                    <p key={i.id}>{i.body ?? i.title}</p>
                  ))}
                </Stack>
              </Panel>
              <Panel>
                <RelatedMediaRiver
                  title="Related Media"
                  description="Visual guides and demonstration media for this Activity"
                  items={riverItems}
                  // Read-only until durable inbound attachments land (Antigravity); attaching
                  // a still-processing upload fails with "not ready".
                />
              </Panel>
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
  const browser = useLibraryBrowser()
  const categorySlugOf = useCategorySlugOf()

  useDocumentTitle('Add Activity')

  const [day, setDay] = useState(
    params.get('day') ??
      today(
        me.data?.data.preferences.timezone ??
          Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
  )
  const [selected, setSelected] = useState<
    components['schemas']['ActivitySummary'] | null
  >(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const categories = useCategories()
  const [categoryId, setCategoryId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [createdActivity, setCreatedActivity] = useState<
    components['schemas']['ActivityDetail'] | null
  >(null)
  const [instructionSaved, setInstructionSaved] = useState(false)
  const key = useRef(crypto.randomUUID())
  const suggestions = useActivitySuggestions({ categoryId })
  const cover = useActivityCover(createdActivity?.revisionId ?? null)
  // The created draft is local state; read the live record so a new cover shows at once.
  const liveActivity = useActivity(createdActivity?.id ?? '')

  /** A starting point prefills a private copy; the new-Activity path stays available. */
  function chooseStartingPoint(activity: components['schemas']['ActivitySummary']) {
    setSelected(activity)
    setCreatedActivity(null)
    setInstructionSaved(false)
    setTitle(activity.title)
    setSummary(activity.summary ?? '')
    setCategoryId(activity.categoryId)
    setInstruction('')
    key.current = crypto.randomUUID()
  }
  const browserContext: LibraryBrowserContext = {
    kind: 'activities',
    categoryId,
    actionLabel: 'Use as starting point',
    onPick: chooseStartingPoint,
  }

  async function addToCalendar(activityId: string) {
    try {
      await add.mutateAsync({
        activityId,
        localDate: day,
        idempotencyKey: key.current,
      })
      navigate(calendarUrl(day))
    } catch {
      // Mutation error remains visible; keep the date and Activity for retry.
    }
  }

  async function createActivity() {
    try {
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
            }))
      if (!createdActivity) setCreatedActivity(created)

      if (
        created.title !== title.trim() ||
        created.summary !== (summary.trim() || null) ||
        created.categoryId !== categoryId
      ) {
        created = await update.mutateAsync({
          activityId: created.id,
          ...(created.title !== title.trim() ? { title: title.trim() } : {}),
          ...(created.summary !== (summary.trim() || null)
            ? { summary: summary.trim() || null }
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
                  <ChangeImage
                    label="Activity image"
                    canEdit
                    cover={cover}
                    hero={activityHero(liveActivity.data ?? createdActivity, categorySlugOf)}
                  />
                ) : (
                  <p className="text-sm text-attention">
                    This Activity has no editable image.
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
                  instruction={instruction}
                  onTitleChange={setTitle}
                  onSummaryChange={setSummary}
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
            <Button variant="outline" className="self-start" onClick={browser.open}>
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
      <Outlet context={browserContext} />
    </Page>
  )
}
