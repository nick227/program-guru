import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getApiClient,
  useCalendar,
  useCategories,
  useCurrentUser,
  useDiscoverActivities,
  useDiscoverCreators,
  useJoinGathering,
  useMyOpportunities,
  useDiscoverPrograms,
  useProgramLibrary,
} from '@project/sdk'
import { useDocumentTitle } from '@/lib/title'
import { SuggestionRail } from '@/components/shared/SuggestionRail'
import { useCategorySlugOf } from '@/components/shared/EntityHero'
import { activityCard } from '@/lib/discoveryCards'
import { interleaveUnique, pickAcrossDomains } from '@/lib/activityRange'
import { NeedsPeoplePrompt } from '@/components/activity/NeedsPeoplePrompt'
import { HomeTopBar } from '@/features/home/components/HomeTopBar'
import { PresentationSurface } from '@/features/home/components/PresentationSurface'
import { ShowMeView } from '@/features/home/components/ShowMeView'
import { TransitionSurface } from '@/features/home/components/TransitionSurface'
import { TurnStage } from '@/features/home/components/TurnStage'
import { resolveTurn } from '@/features/home/engine/decisionEngine'
import { buildPresentationItems } from '@/features/home/engine/presentationFeed'
import type {
  AssistantCard,
  CardAction,
  ChoiceButton,
  DiscoveryState,
  FlowNodeId,
  HomeSignals,
  PresentationMode,
  PreviewTarget,
} from '@/features/home/engine/types'

interface HistoryEntry {
  nodeId: FlowNodeId
  state: DiscoveryState
}

const STORAGE_KEY = 'pg.home.conversation.v1'

const INITIAL_STATE: DiscoveryState = {
  excludedIds: [],
}

function getLocalDateIso(offsetDays = 0): string {
  const now = new Date()
  now.setDate(now.getDate() + offsetDays)
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadSession(): {
  nodeId: FlowNodeId
  state: DiscoveryState
  history: HistoryEntry[]
} {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { nodeId: 'opening', state: INITIAL_STATE, history: [] }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.nodeId === 'string' && parsed.state) {
      return {
        nodeId: parsed.nodeId as FlowNodeId,
        state: {
          ...INITIAL_STATE,
          ...parsed.state,
          excludedIds: Array.isArray(parsed.state.excludedIds)
            ? parsed.state.excludedIds
            : [],
        },
        history: Array.isArray(parsed.history) ? parsed.history : [],
      }
    }
  } catch {
    // Ignore malformed sessionStorage
  }
  return { nodeId: 'opening', state: INITIAL_STATE, history: [] }
}

const GATHERING_CARD = 'gathering:'

export function HomePage() {
  useDocumentTitle('Home')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const isSignedIn = Boolean(me.data)
  const today = useMemo(() => getLocalDateIso(0), [])
  const tomorrow = useMemo(() => getLocalDateIso(1), [])

  const initial = useMemo(() => loadSession(), [])
  const [nodeId, setNodeId] = useState<FlowNodeId>(initial.nodeId)
  const [state, setState] = useState<DiscoveryState>(initial.state)
  const [history, setHistory] = useState<HistoryEntry[]>(initial.history)
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null)
  const [executionItemId, setExecutionItemId] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const [showMeOpen, setShowMeOpen] = useState(false)
  const [presentationMode, setPresentationMode] =
    useState<PresentationMode>('for_you')
  const [completedInSession, setCompletedInSession] = useState<string | null>(
    null,
  )
  const [actionPending, setActionPending] = useState(false)

  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ nodeId, state, history }),
      )
    } catch {
      // Ignore storage quota errors
    }
  }, [nodeId, state, history])

  // Compose existing SDK hooks client-side for P1
  const calendar = useCalendar(today, today, isSignedIn)
  const library = useProgramLibrary(isSignedIn)
  const categories = useCategories()
  const liveSessions = useDiscoverPrograms({
    timing: 'HAPPENING_NOW',
    sort: 'POPULAR',
    limit: 10,
    enabled: true,
  })
  const popularPrograms = useDiscoverPrograms({
    sort: 'POPULAR',
    limit: 12,
    enabled: true,
  })
  const newPrograms = useDiscoverPrograms({
    sort: 'NEW',
    limit: 12,
    enabled: true,
  })
  const activities = useDiscoverActivities({
    sort: 'POPULAR',
    enabled: true,
  })
  const categoryActivities = useDiscoverActivities({
    sort: 'POPULAR',
    categoryId: state.categoryId,
    enabled: Boolean(state.categoryId),
  })
  const creators = useDiscoverCreators({ enabled: true })
  // Discovery quality (12 §5c): personalized Programs with reasons (the Agent's picked Domain counts),
  // and Following as actual follows.
  const forYouPrograms = useDiscoverPrograms({ sort: 'FOR_YOU', categoryId: state.categoryId, limit: 12, enabled: isSignedIn })
  const followedPrograms = useDiscoverPrograms({ creatorScope: 'FOLLOWING', sort: 'NEW', limit: 12, enabled: isSignedIn })
  const followedCreators = useDiscoverCreators({ creatorScope: 'FOLLOWING', enabled: isSignedIn })
  // Opportunity Radar (12 §5b): one result set for the Agent and the rail.
  const radar = useMyOpportunities(isSignedIn)
  const joinGathering = useJoinGathering()

  const mergedActivities = useMemo(() => {
    const base = activities.data?.pages.flatMap((p) => p.data) ?? []
    const scoped = categoryActivities.data?.pages.flatMap((p) => p.data) ?? []
    if (scoped.length === 0) return base
    const seen = new Set(scoped.map((i) => i.activity?.id).filter(Boolean))
    return [...scoped, ...base.filter((i) => i.activity?.id && !seen.has(i.activity.id))]
  }, [activities.data, categoryActivities.data])

  // Newest catalog Activities alongside the most-used ones, so new content is visible without
  // inventing popularity (12 §5a). Both are existing `/discover` orderings.
  const newestActivities = useDiscoverActivities({ sort: 'NEW', enabled: true })
  const categorySlugOf = useCategorySlugOf()
  const rangeCards = useMemo(() => {
    const listOf = (data: typeof activities.data) =>
      (data?.pages.flatMap((p) => p.data) ?? []).flatMap((i) => (i.activity ? [i.activity] : []))
    return pickAcrossDomains(interleaveUnique(listOf(activities.data), listOf(newestActivities.data))).map((a) =>
      activityCard(a, categorySlugOf),
    )
  }, [activities.data, newestActivities.data, categorySlugOf])

  const railCards = useMemo(() => {
    const picks = (radar.data?.recommendations ?? []).slice(0, 2).map((o) => ({
      ...activityCard(o.gathering.activity, categorySlugOf),
      id: `${GATHERING_CARD}${o.gathering.id}`,
      meta: o.reasons[0]!.label,
    }))
    return [...picks, ...rangeCards].slice(0, 5)
  }, [radar.data, rangeCards, categorySlugOf])
  const needsPeople = radar.data?.needsPeople[0] ?? null

  const signals: HomeSignals = useMemo(
    () => ({
      isSignedIn,
      todayItems: calendar.data ?? [],
      knownProgramIds: !isSignedIn ? [] : library.isSuccess
        ? (library.data ?? []).map((entry) => entry.program.id)
        : null,
      activeEnrollments: (library.data ?? [])
        .filter((entry) => entry.status === 'Active')
        .map((entry) => ({
          id: entry.program.id,
          programId: entry.program.id,
          programTitle: entry.program.title,
          status: 'ACTIVE',
          hasParticipated: !!entry.current && (entry.current.completed > 0 || !!entry.current.lastParticipation),
          nextActivity: entry.current?.upcoming[0]
            ? { id: entry.current.upcoming[0].id, title: entry.current.upcoming[0].title, date: entry.current.upcoming[0].date }
            : null,
        })),
      liveSessions: liveSessions.data?.pages.flatMap((p) => p.data) ?? [],
      opportunities: radar.data?.recommendations ?? [],
      forYouPrograms: forYouPrograms.data?.pages.flatMap((p) => p.data) ?? [],
      followedPrograms: followedPrograms.data?.pages.flatMap((p) => p.data) ?? [],
      followedCreators: followedCreators.data?.pages.flatMap((p) => p.data) ?? [],
      popularPrograms: popularPrograms.data?.pages.flatMap((p) => p.data) ?? [],
      newPrograms: newPrograms.data?.pages.flatMap((p) => p.data) ?? [],
      activities: mergedActivities,
      creators: creators.data?.pages.flatMap((p) => p.data) ?? [],
      // `custom` is the authoring fallback, never a discovery Domain (02-DOMAIN §2).
      categories: (categories.data ?? []).filter((c) => c.slug !== 'custom').map((c) => ({
        id: c.id,
        name: c.label,
      })),
    }),
    [
      isSignedIn,
      calendar.data,
      library.data,
      liveSessions.data,
      radar.data,
      forYouPrograms.data,
      followedPrograms.data,
      followedCreators.data,
      popularPrograms.data,
      newPrograms.data,
      mergedActivities,
      creators.data,
      categories.data,
    ],
  )

  const loading =
    me.isPending ||
    (popularPrograms.isPending &&
      activities.isPending &&
      (!isSignedIn || calendar.isPending)) ||
    (Boolean(state.categoryId) && categoryActivities.isPending) ||
    (isSignedIn && library.isPending)

  const turn = useMemo(
    () => resolveTurn(nodeId, state, signals),
    [nodeId, state, signals],
  )

  const presentationItems = useMemo(() => {
    if (turn.cards && turn.cards.length > 0) return turn.cards.slice(0, 3)
    if (turn.card) return [turn.card]
    if (turn.presentationHint?.items && turn.presentationHint.items.length > 0) {
      return turn.presentationHint.items.slice(0, 3)
    }
    const activeMode = turn.presentationHint?.mode ?? presentationMode
    return buildPresentationItems(activeMode, signals).slice(0, 1)
  }, [presentationMode, signals, turn.card, turn.cards, turn.presentationHint])

  const presentationTitle = useMemo(() => {
    if (turn.cards && turn.cards.length > 1) return 'Results'
    if (turn.presentationHint?.label) return turn.presentationHint.label
    if (turn.presentationHint?.mode === 'popular') return 'Popular'
    if (turn.presentationHint?.mode === 'following') return 'Following'
    return 'Suggested'
  }, [turn.cards, turn.presentationHint])

  const handleReset = useCallback(() => {
    setPreviewTarget(null)
    setExecutionItemId(null)
    setShowWhy(false)
    setShowMeOpen(false)
    setCompletedInSession(null)
    setNodeId('opening')
    setState(INITIAL_STATE)
    setHistory([])
  }, [])

  const handleBack = useCallback(() => {
    if (previewTarget) {
      setPreviewTarget(null)
      return
    }
    if (executionItemId) {
      setExecutionItemId(null)
      return
    }
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setNodeId(prev.nodeId)
    setState(prev.state)
  }, [executionItemId, history, previewTarget])

  const executeAction = useCallback(
    async (action: CardAction) => {
      switch (action.type) {
        case 'preview':
          setPreviewTarget(action.target)
          return
        case 'open_occurrence':
          setPreviewTarget(null)
          setExecutionItemId(action.itemId)
          return
        case 'navigate_occurrence':
          navigate(`/occurrences/${action.itemId}`)
          return
        case 'open_activity':
          if (!isSignedIn) {
            navigate(`/login?returnTo=${encodeURIComponent('/')}`)
            return
          }
          setActionPending(true)
          try {
            const res = await getApiClient().POST('/calendar/items', {
              body: {
                activityId: action.activityId,
                localDate: today,
                idempotencyKey: crypto.randomUUID(),
              },
            })
            if (res.error || !res.data?.data?.item?.id) {
              throw res.error ?? new Error('Could not start activity')
            }
            await queryClient.invalidateQueries({ queryKey: ['calendar'] })
            setPreviewTarget(null)
            setExecutionItemId(res.data.data.item.id)
          } catch {
            toast.error('Could not start Activity right now')
          } finally {
            setActionPending(false)
          }
          return
        case 'navigate_activity':
          navigate(`/activities/${action.activityId}`)
          return
        case 'open_program':
          navigate(`/programs/${action.programId}`)
          return
        case 'join_gathering': {
          // One primary action: join (reusing the viewer's item), then open that occurrence.
          setActionPending(true)
          try {
            const result = await joinGathering.mutateAsync({
              gatheringId: action.gatheringId,
              calendarItemId: action.calendarItemId,
              idempotencyKey: crypto.randomUUID(),
            })
            toast.success('Joined. It is on your Calendar.')
            navigate(`/occurrences/${result.calendarItemId}`)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not join')
          } finally {
            setActionPending(false)
          }
          return
        }
        case 'open_group':
          setShowWhy(false)
          setShowMeOpen(false)
          setPreviewTarget({ kind: 'group', id: action.groupId })
          return
        case 'open_creator':
          navigate(`/@${action.handle}`)
          return
        case 'open_calendar':
          navigate('/calendar')
          return
        case 'open_browse':
          navigate('/browse')
          return
        case 'move_to_tomorrow':
          setActionPending(true)
          try {
            const res = await getApiClient().PATCH('/calendar-items/{itemId}', {
              params: { path: { itemId: action.itemId } },
              body: {
                localDate: tomorrow,
                expectedUpdatedAt: action.updatedAt,
              },
            })
            if (res.error) throw res.error
            await queryClient.invalidateQueries({ queryKey: ['calendar'] })
            toast.success(`Moved ${action.title} to tomorrow`)
          } catch {
            toast.error('Could not move Activity right now')
          } finally {
            setActionPending(false)
          }
          return
        case 'follow_creator':
          if (!isSignedIn) {
            navigate(`/login?returnTo=${encodeURIComponent('/')}`)
            return
          }
          setActionPending(true)
          try {
            const res = await getApiClient().POST('/follow-users/{userId}', {
              params: { path: { userId: action.userId } },
            })
            if (res.error) throw res.error
            await queryClient.invalidateQueries({ queryKey: ['discover'] })
            toast.success(`Following @${action.handle}`)
          } catch {
            toast.error('Could not follow creator right now')
          } finally {
            setActionPending(false)
          }
          return
      }
    },
    [isSignedIn, navigate, queryClient, today, tomorrow, joinGathering],
  )

  const handleChoice = useCallback(
    (choice: ChoiceButton) => {
      const effect = choice.effect
      if (effect.type === 'execute') {
        void executeAction(effect.action)
        return
      }
      if (effect.type === 'reset') {
        handleReset()
        return
      }
      if (effect.type === 'explain_why') {
        setShowWhy((prev) => !prev)
        return
      }
      if (effect.type === 'show_me') {
        setShowMeOpen((prev) => !prev)
        return
      }
      if (effect.type === 'transition') {
        setShowWhy(false)
        setShowMeOpen(false)
        setHistory((h) => [...h, { nodeId, state }])
        setState((prev) => ({ ...prev, ...effect.patch }))
        setNodeId(effect.nodeId)
        return
      }
      if (effect.type === 'refine') {
        const currentCardId = turn.card?.id
        const nextExcluded = currentCardId
          ? [...state.excludedIds, currentCardId]
          : state.excludedIds

        if (effect.kind === 'shorter') {
          const currentCap = state.maxMinutes ?? 30
          const shorterCap = currentCap > 20 ? 20 : currentCap > 10 ? 10 : 5
          setHistory((h) => [...h, { nodeId, state }])
          setState((prev) => ({
            ...prev,
            maxMinutes: shorterCap,
            excludedIds: nextExcluded,
          }))
          return
        }

        if (effect.kind === 'with_others') {
          setHistory((h) => [...h, { nodeId, state }])
          setNodeId('together_result')
          return
        }

        if (effect.kind === 'popular') {
          setHistory((h) => [...h, { nodeId, state }])
          setState((prev) => ({
            ...prev,
            preferPopular: true,
            level: undefined,
            maxMinutes: undefined,
            excludedIds: nextExcluded,
          }))
          return
        }

        // 'different' or 'more_like_this'
        setState((prev) => ({ ...prev, excludedIds: nextExcluded }))
      }
    },
    [executeAction, handleReset, nodeId, state, turn.card?.id],
  )

  const handleCloseExecution = useCallback(() => {
    setExecutionItemId(null)
    if (completedInSession) {
      setState((prev) => ({ ...prev, lastCompletedTitle: completedInSession }))
      if (nodeId !== 'day_schedule') {
        setNodeId('post_completion')
      }
      setCompletedInSession(null)
    }
  }, [completedInSession, nodeId])

  const handleNextAfterExecution = useCallback(() => {
    setExecutionItemId(null)
    setPreviewTarget(null)
    setShowWhy(false)
    if (completedInSession) {
      setState((prev) => ({ ...prev, lastCompletedTitle: completedInSession }))
      setNodeId('post_completion')
      setCompletedInSession(null)
      return
    }
    const currentCardId = turn.card?.id
    if (currentCardId) {
      setState((prev) => ({
        ...prev,
        excludedIds: [...prev.excludedIds, currentCardId],
      }))
    }
  }, [completedInSession, turn.card?.id])

  const handleClearFilter = useCallback(
    (key: 'maxMinutes' | 'categoryId' | 'level') => {
      setState((prev) => {
        const next = { ...prev }
        if (key === 'maxMinutes') delete next.maxMinutes
        if (key === 'level') delete next.level
        if (key === 'categoryId') {
          delete next.categoryId
          delete next.categoryName
        }
        return next
      })
    },
    [],
  )

  const handleSelectPresentationItem = useCallback((card: AssistantCard) => {
    setShowWhy(false)
    setShowMeOpen(false)
    setPreviewTarget(card.previewTarget)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <HomeTopBar
        onReset={handleReset}
        showReset={
          nodeId !== 'opening' ||
          state.excludedIds.length > 0 ||
          previewTarget !== null ||
          executionItemId !== null
        }
      />
      <main
        id="main"
        className="flex flex-1 flex-col"
      >
        <div
          className={
            previewTarget?.kind === 'group' || previewTarget?.kind === 'session'
              ? 'flex flex-1 flex-col'
              : 'flex flex-1 flex-col justify-center'
          }
        >
          <TransitionSurface
            ready={!loading || Boolean(previewTarget) || Boolean(executionItemId)}
          >
            <TurnStage
            turn={turn}
            discoveryState={state}
            showWhy={showWhy}
            previewTarget={previewTarget}
            executionItemId={executionItemId}
            isSignedIn={isSignedIn}
            todayIso={today}
            canGoBack={
              history.length > 0 ||
              previewTarget !== null ||
              executionItemId !== null
            }
            loading={loading}
            actionPending={actionPending}
            onChoice={handleChoice}
            onClearFilter={handleClearFilter}
            onPreview={setPreviewTarget}
            onClosePreview={() => setPreviewTarget(null)}
            onCloseExecution={handleCloseExecution}
            onExecutionCompleted={(title) => setCompletedInSession(title)}
            onNextAfterExecution={handleNextAfterExecution}
            onOpenOccurrencePage={(itemId) => navigate(`/occurrences/${itemId}`)}
            onCardAction={executeAction}
            onBack={handleBack}
          />
          </TransitionSurface>
        </div>
        {!previewTarget && !executionItemId && turn.nodeId !== 'day_schedule' && (
          showMeOpen && turn.showMeSubject ? (
            <div className="w-full border-t border-border/50 py-5">
              <ShowMeView
                subject={turn.showMeSubject}
                todayItems={signals.todayItems}
                activeProgramCount={signals.activeEnrollments.length}
                onClose={() => setShowMeOpen(false)}
                onPreview={setPreviewTarget}
              />
            </div>
          ) : (
            <>
              <PresentationSurface
                title={presentationTitle}
                items={presentationItems}
                loading={loading}
                pending={actionPending}
                onSelect={handleSelectPresentationItem}
                onAction={executeAction}
                onPreviewCreator={setPreviewTarget}
              />
              {/* The range of things to do (12 §5a), led by up to two Radar recommendations (12 §5b). */}
              {(railCards.length > 0 || needsPeople) && (
                <div className="w-full border-t border-border/50 py-5">
                  <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6">
                    {needsPeople && <NeedsPeoplePrompt item={needsPeople} />}
                    <SuggestionRail
                      title="Things to do"
                      items={railCards}
                      loading={false}
                      error={null}
                      actionLabel="Open"
                      onPick={(id) =>
                        id.startsWith(GATHERING_CARD)
                          ? navigate(`/gatherings/${id.slice(GATHERING_CARD.length)}`)
                          : setPreviewTarget({ kind: 'activity', id })
                      }
                    />
                  </div>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  )
}

