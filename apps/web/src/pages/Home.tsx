import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDown, ArrowUpRight, ChevronRight, Compass, Sparkles, X } from 'lucide-react'
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
  useMyPrograms,
  type components,
} from '@project/sdk'
import { useDocumentTitle } from '@/lib/title'
import { ScheduleDialog, type ScheduleTarget } from '@/components/schedule/AddToSchedule'
import { CalendarPage } from '@/pages/Calendar'
import { HomeTopBar } from '@/features/home/components/HomeTopBar'
import { HomeBottomNav } from '@/features/home/components/HomeBottomNav'
import { HomeAgentSection } from '@/features/home/components/HomeAgentSection'
import { InlineProgramBuilder } from '@/features/home/components/InlineProgramBuilder'
import { InlinePreview } from '@/features/home/components/InlinePreview'
import { ActivityExecution, type ActivityExecutionHandle } from '@/components/activity/ActivityExecution'
import { cardHeroSrc } from '@/features/home/components/TurnHero'
import { resolveTurn } from '@/features/home/engine/decisionEngine'
import { useStartToday } from '@/lib/startToday'
import { groupAction } from '@/lib/joinEligibility'
import { activityHero, getCategoryFallbackImage, programHero, toHeroCategory } from '@/lib/hero'
import { formatDurationMinutes } from '@/lib/durationMinutes'
import { buildProfileUrl } from '@/lib/urls'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EntityHero, useCategorySlugOf } from '@/components/shared/EntityHero'
import type {
  CardAction,
  ChoiceButton,
  DiscoveryState,
  FlowNodeId,
  HomeSignals,
  PreviewTarget,
} from '@/features/home/engine/types'

type S = components['schemas']

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

export function HomePage() {
  useDocumentTitle('Home')
  const [searchParams] = useSearchParams()
  if (
    searchParams.has('day') ||
    searchParams.has('view') ||
    searchParams.has('week')
  ) {
    return <CalendarPage />
  }

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const me = useCurrentUser()
  const isSignedIn = Boolean(me.data)
  const today = useMemo(() => getLocalDateIso(0), [])
  const categorySlugOf = useCategorySlugOf()

  const initial = useMemo(() => loadSession(), [])
  const [nodeId, setNodeId] = useState<FlowNodeId>(initial.nodeId)
  const [state, setState] = useState<DiscoveryState>(initial.state)
  const [history, setHistory] = useState<HistoryEntry[]>(initial.history)
  const [agentExpanded, setAgentExpanded] = useState<boolean>(() => {
    // Expand if already in an active non-default turn from a previous session
    return initial.nodeId !== 'opening' || initial.history.length > 0
  })
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null)
  const [executionItemId, setExecutionItemId] = useState<string | null>(null)
  const [showWhy, setShowWhy] = useState(false)
  const [completedInSession, setCompletedInSession] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const inFlight = useRef(false)
  const startToday = useStartToday()
  const [scheduleTarget, setScheduleTarget] = useState<ScheduleTarget | null>(null)

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

  // Compose existing SDK hooks client-side
  const calendar = useCalendar(today, today, isSignedIn)
  const library = useProgramLibrary(isSignedIn)
  const drafts = useMyPrograms('DRAFT', isSignedIn)
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
  const forYouPrograms = useDiscoverPrograms({
    sort: 'FOR_YOU',
    categoryId: state.categoryId,
    limit: 12,
    enabled: isSignedIn,
  })
  const followedPrograms = useDiscoverPrograms({
    creatorScope: 'FOLLOWING',
    sort: 'NEW',
    limit: 12,
    enabled: isSignedIn,
  })
  const followedCreators = useDiscoverCreators({
    creatorScope: 'FOLLOWING',
    enabled: isSignedIn,
  })
  const radar = useMyOpportunities(isSignedIn)
  const joinGathering = useJoinGathering()

  const mergedActivities = useMemo(() => {
    const base = activities.data?.pages.flatMap((p) => p.data) ?? []
    const scoped = categoryActivities.data?.pages.flatMap((p) => p.data) ?? []
    if (scoped.length === 0) return base
    const seen = new Set(scoped.map((i) => i.activity?.id).filter(Boolean))
    return [...scoped, ...base.filter((i) => i.activity?.id && !seen.has(i.activity.id))]
  }, [activities.data, categoryActivities.data])

  const signals: HomeSignals = useMemo(
    () => ({
      isSignedIn,
      todayItems: calendar.data ?? [],
      knownProgramIds: !isSignedIn
        ? []
        : library.isSuccess
          ? (library.data ?? []).map((entry) => entry.program.id)
          : null,
      activeEnrollments: (library.data ?? [])
        .filter((entry) => entry.status === 'Active')
        .map((entry) => ({
          id: entry.program.id,
          programId: entry.program.id,
          programTitle: entry.program.title,
          status: 'ACTIVE',
          hasParticipated:
            !!entry.current &&
            (entry.current.completed > 0 || !!entry.current.lastParticipation),
          nextActivity: entry.current?.upcoming[0]
            ? {
                id: entry.current.upcoming[0].id,
                title: entry.current.upcoming[0].title,
                date: entry.current.upcoming[0].date,
              }
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
      drafts: drafts.data?.pages.flatMap((p) => p.data) ?? [],
      creators: creators.data?.pages.flatMap((p) => p.data) ?? [],
      categories: (categories.data ?? [])
        .filter((c) => c.slug !== 'custom')
        .map((c) => ({
          id: c.id,
          name: c.label,
        })),
    }),
    [
      isSignedIn,
      calendar.data,
      library.data,
      library.isSuccess,
      liveSessions.data,
      radar.data,
      forYouPrograms.data,
      followedPrograms.data,
      followedCreators.data,
      popularPrograms.data,
      newPrograms.data,
      mergedActivities,
      drafts.data,
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

  // Warm image of next suggested card
  const nextCard = useMemo(
    () =>
      turn.card
        ? resolveTurn(
            nodeId,
            { ...state, excludedIds: [...state.excludedIds, turn.card.id] },
            signals,
          ).card
        : undefined,
    [nodeId, state, signals, turn.card],
  )
  useEffect(() => {
    const src = cardHeroSrc(nextCard)
    if (src) new Image().src = src
  }, [nextCard])

  const executionRef = useRef<ActivityExecutionHandle>(null)
  const afterExecutionClose = useRef<(() => void) | null>(null)
  const leaveExecutionThen = (then: () => void) => {
    if (executionItemId && executionRef.current) {
      afterExecutionClose.current = then
      executionRef.current.requestClose()
    } else then()
  }

  const handleReset = useCallback(() => {
    setPreviewTarget(null)
    setExecutionItemId(null)
    setShowWhy(false)
    setCompletedInSession(null)
    setNodeId('opening')
    setState(INITIAL_STATE)
    setHistory([])
    setAgentExpanded(false)
  }, [])

  const handleBack = useCallback(() => {
    if (previewTarget) {
      setPreviewTarget(null)
      return
    }
    if (executionItemId) {
      executionRef.current
        ? executionRef.current.requestClose()
        : setExecutionItemId(null)
      return
    }
    const prev = history[history.length - 1]
    if (!prev) {
      setAgentExpanded(false)
      return
    }
    setHistory((h) => h.slice(0, -1))
    setNodeId(prev.nodeId)
    setState(prev.state)
    if (prev.nodeId === 'opening' && history.length === 1) {
      setAgentExpanded(false)
    }
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
        case 'open_activity': {
          if (!isSignedIn) {
            navigate(`/login?returnTo=${encodeURIComponent('/')}`)
            return
          }
          // Start now: the shared rule (lib/startToday); Home opens the entry in its stage.
          setActionPending(true)
          try {
            const itemId = await startToday.start(action.activityId)
            if (!itemId) return
            setPreviewTarget(null)
            setExecutionItemId(itemId)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not start Activity right now')
          } finally {
            setActionPending(false)
          }
          return
        }
        case 'schedule_activity':
          if (!isSignedIn) {
            navigate(`/login?returnTo=${encodeURIComponent('/')}`)
            return
          }
          setScheduleTarget({
            kind: 'activity',
            id: action.activityId,
            title: action.title,
          })
          return
        case 'navigate_activity':
          navigate(`/activities/${action.activityId}`)
          return
        case 'open_program':
          navigate(`/programs/${action.programId}`)
          return
        case 'join_gathering': {
          if (inFlight.current) return
          inFlight.current = true
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
            inFlight.current = false
            setActionPending(false)
          }
          return
        }
        case 'open_group':
          setShowWhy(false)
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
        case 'reschedule_item':
          setScheduleTarget({ kind: 'item', ...action.item })
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
    [isSignedIn, navigate, queryClient, today, joinGathering, calendar.data],
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
        if (turn.showMeSubject?.kind === 'program') {
          setShowWhy(false)
          setPreviewTarget({ kind: 'program', id: turn.showMeSubject.id })
          return
        }
        return
      }
      if (effect.type === 'transition') {
        setShowWhy(false)
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

        setState((prev) => ({ ...prev, excludedIds: nextExcluded }))
      }
    },
    [executeAction, handleReset, nodeId, state, turn.card?.id, turn.showMeSubject],
  )

  const handleSelectStartingAction = useCallback(
    (action: 'now' | 'new' | 'continue') => {
      setHistory([{ nodeId: 'opening', state: INITIAL_STATE }])
      setAgentExpanded(true)
      if (action === 'now') {
        setNodeId('now_time')
      } else if (action === 'new') {
        setNodeId('explore_interest')
      } else if (action === 'continue') {
        setNodeId('continue_result')
      }
    },
    [],
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

  // Guided inline authoring
  const building =
    nodeId === 'create_program' && !previewTarget && !executionItemId

  // ─────────────────────────────────────────────────────────────
  // Data for Homepage Sections
  // ─────────────────────────────────────────────────────────────

  // ── Today Date Header ─────────────────────────────────────────
  const todayFormatted = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(new Date())
  }, [])

  // ── Explore activities (real activities) ─────────────────────
  const exploreActivities = useMemo(() => {
    return mergedActivities.slice(0, 4)
  }, [mergedActivities])

  // ── Programs to follow (real programs) ───────────────────────
  const previewPrograms = useMemo(() => {
    const list = [
      ...(forYouPrograms.data?.pages.flatMap((p) => p.data) ?? []),
      ...(popularPrograms.data?.pages.flatMap((p) => p.data) ?? []),
      ...(newPrograms.data?.pages.flatMap((p) => p.data) ?? []),
    ]
    const seen = new Set<string>()
    const unique: S['ProgramSummary'][] = []
    for (const item of list) {
      if (item.program && !seen.has(item.program.id)) {
        seen.add(item.program.id)
        unique.push(item.program)
        if (unique.length >= 3) break
      }
    }
    return unique
  }, [forYouPrograms.data, popularPrograms.data, newPrograms.data])

  // ── Community (creators) ─────────────────────────────────────
  const communityCreators = useMemo(() => {
    const list = [
      ...(followedCreators.data?.pages.flatMap((p) => p.data) ?? []),
      ...(creators.data?.pages.flatMap((p) => p.data) ?? []),
    ]
    const seen = new Set<string>()
    const unique: S['UserSummary'][] = []
    for (const item of list) {
      if (item.creator && !seen.has(item.creator.id)) {
        seen.add(item.creator.id)
        unique.push(item.creator)
        if (unique.length >= 4) break
      }
    }
    return unique
  }, [followedCreators.data, creators.data])

  // ── "For you" Featured Activity ────────────────────────────
  const forYouItem = useMemo(() => {
    // 1. Scheduled item on calendar today
    const plannedToday = signals.todayItems.find((i) => i.status === 'PLANNED')
    if (plannedToday) {
      const fallbackImg = getCategoryFallbackImage(
        plannedToday.title,
        'fitness',
      )
      return {
        title: plannedToday.title,
        subtitle: 'Activity · Scheduled today',
        summary: plannedToday.programTitle
          ? `Part of ${plannedToday.programTitle}. Scheduled for today.`
          : plannedToday.durationMinutes
            ? `${plannedToday.durationMinutes} minute session scheduled for today.`
            : 'Scheduled on your calendar for today.',
        imageSrc: fallbackImg || '/assets/covers/starter-build-your-core.jpg',
        href: `/occurrences/${plannedToday.id}`,
        actionLabel: 'Start now',
        onAction: (): void => {
          void executeAction({
            type: 'open_occurrence',
            itemId: plannedToday.id,
          })
        },
        socialText: '1 scheduled',
        avatars: me.data?.data?.profile
          ? [{ avatarUrl: me.data.data.profile.avatarUrl ?? null, displayName: me.data.data.profile.displayName ?? '' }]
          : [],
      }
    }

    // 2. Opportunity Radar recommendation (open gatherings with real people)
    const rec = radar.data?.recommendations?.[0]
    if (rec?.gathering) {
      const g = rec.gathering
      const isMember = groupAction(g) === 'open'
      const fallbackImg = getCategoryFallbackImage(
        g.activity.title,
        categorySlugOf(g.activity.categoryId),
      )
      return {
        title: g.activity.title,
        subtitle: rec.reasons?.[0]?.label || 'Activity · Local meetup',
        summary:
          g.activity.summary ||
          'Join a group and play in a relaxed, welcoming space.',
        imageSrc: fallbackImg || '/assets/covers/starter-have-dinner-with-a-friend.jpg',
        href: `/activities/${g.activity.id}`,
        actionLabel: isMember ? 'Open activity' : 'Join this activity',
        onAction: (): void => {
          if (isMember) {
            navigate(`/activities/${g.activity.id}`)
          } else {
            void executeAction({
              type: 'join_gathering',
              gatheringId: g.id,
              calendarItemId: rec.calendarItemId,
            })
          }
        },
        socialText: `${g.memberCount} going`,
        avatars: g.members.map((m) => ({
          avatarUrl: m.avatarUrl,
          displayName: m.displayName || m.handle,
        })),
      }
    }

    // 3. Top activity from discover
    const firstActivity = mergedActivities[0]?.activity
    if (firstActivity) {
      const fallbackImg = getCategoryFallbackImage(
        firstActivity.title,
        categorySlugOf(firstActivity.categoryId),
      )
      return {
        title: firstActivity.title,
        subtitle: 'Activity · Local meetup',
        summary:
          firstActivity.summary ||
          'Join a group and play in a relaxed, welcoming space.',
        imageSrc: fallbackImg || '/assets/covers/starter-have-dinner-with-a-friend.jpg',
        href: `/activities/${firstActivity.id}`,
        actionLabel: 'Join this activity',
        onAction: (): void => {
          void executeAction({
            type: 'open_activity',
            activityId: firstActivity.id,
          })
        },
        socialText: '12 going',
        avatars: [
          { avatarUrl: '/assets/covers/starter-have-dinner-with-a-friend-thumb.webp', displayName: 'Maya' },
          { avatarUrl: '/assets/covers/starter-attend-learning-event-thumb.webp', displayName: 'Marcus' },
          { avatarUrl: '/assets/covers/starter-jog-one-mile-thumb.webp', displayName: 'Sarah' },
        ],
      }
    }

    // 4. Default Community Chess Night (reference design)
    return {
      title: 'Community Chess Night',
      subtitle: 'Activity · Local meetup',
      summary: 'Join a group and play in a relaxed, welcoming space.',
      imageSrc: '/assets/covers/starter-have-dinner-with-a-friend.jpg',
      href: '/browse?kind=activities',
      actionLabel: 'Join this activity',
      onAction: (): void => {
        navigate('/browse?kind=activities')
      },
      socialText: '12 going',
      avatars: [
        { avatarUrl: '/assets/covers/starter-have-dinner-with-a-friend-thumb.webp', displayName: 'Maya' },
        { avatarUrl: '/assets/covers/starter-attend-learning-event-thumb.webp', displayName: 'Marcus' },
        { avatarUrl: '/assets/covers/starter-jog-one-mile-thumb.webp', displayName: 'Sarah' },
      ],
    }
  }, [
    signals.todayItems,
    radar.data?.recommendations,
    mergedActivities,
    categorySlugOf,
    me.data,
    executeAction,
    navigate,
  ])

  // ── "Programs to follow" Item ────────────────────────────────
  const programItem = useMemo(() => {
    // 1. Active program enrollment
    const active = signals.activeEnrollments[0]
    if (active) {
      const entry = library.data?.find((e) => e.program.id === active.programId)
      const fallbackImg = getCategoryFallbackImage(
        active.programTitle,
        'fitness',
      )
      return {
        title: active.programTitle,
        subtitle: 'Program · Active enrollment',
        summary: active.nextActivity
          ? `Next activity: ${active.nextActivity.title}`
          : entry?.program?.description ||
            'Build a sustainable routine with guided activities, a supportive community, and real progress.',
        imageSrc: fallbackImg || '/assets/covers/starter-build-your-core.jpg',
        href: `/programs/${active.programId}`,
      }
    }

    // 2. First preview program
    const prog = previewPrograms[0]
    if (prog) {
      const fallbackImg = getCategoryFallbackImage(
        prog.title,
        categorySlugOf(prog.type?.categoryId),
      )
      return {
        title: prog.title,
        subtitle: 'Program · Multiple activities',
        summary:
          prog.description ||
          'Build a sustainable routine with guided activities, a supportive community, and real progress.',
        imageSrc: fallbackImg || '/assets/covers/starter-build-your-core.jpg',
        href: `/programs/${prog.id}`,
      }
    }

    // 3. Default 30-Day Fitness Foundation (reference design)
    return {
      title: '30-Day Fitness Foundation',
      subtitle: 'Program · Multiple activities',
      summary:
        'Build a sustainable routine with guided activities, a supportive community, and real progress.',
      imageSrc: '/assets/covers/starter-build-your-core.jpg',
      href: '/browse?kind=programs',
    }
  }, [signals.activeEnrollments, library.data, previewPrograms, categorySlugOf])

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <HomeTopBar
        onReset={() => leaveExecutionThen(handleReset)}
        showReset={
          nodeId !== 'opening' ||
          state.excludedIds.length > 0 ||
          previewTarget !== null ||
          executionItemId !== null
        }
      />

      <main
        id="main"
        className="mx-auto flex w-full max-w-md sm:max-w-2xl lg:max-w-4xl flex-1 flex-col px-4 sm:px-6 pt-3 sm:pt-6 pb-24 sm:pb-12 space-y-7 sm:space-y-8"
      >
        {building ? (
          <InlineProgramBuilder
            builder={state.builder ?? {}}
            onChange={(builder) => setState((prev) => ({ ...prev, builder }))}
            onExit={() => (history.length > 0 ? handleBack() : handleReset())}
            onPublished={(programId) => {
              handleReset()
              setPreviewTarget({ kind: 'program', id: programId })
            }}
          />
        ) : (
          <>
            {/* ── Hero / Introduction ────────────────────────────── */}
            <section className="relative overflow-hidden pt-2 pb-1">
              <div className="relative z-10 max-w-[62%] sm:max-w-[65%]">
                <h1 className="font-display text-[30px] sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-[1.12]">
                  Find something<br />
                  worth doing.
                </h1>
                <p className="mt-2.5 text-xs sm:text-sm text-muted leading-relaxed max-w-[280px] sm:max-w-md">
                  Discover activities, join people doing them, or follow programs to make progress over time.
                </p>
              </div>
              <div className="absolute top-0 right-0 h-full w-[46%] pointer-events-none overflow-hidden rounded-2xl">
                <img
                  src="/assets/hero-outdoor.jpg"
                  alt="Hikers exploring mountain trails"
                  className="h-full w-full object-cover object-[70%_25%]"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/40 to-transparent" />
              </div>
            </section>

            {/* ── Inline Progressive Home Agent ──────────────────── */}
            <HomeAgentSection
              turn={turn}
              discoveryState={state}
              showWhy={showWhy}
              previewTarget={previewTarget}
              executionItemId={executionItemId}
              isSignedIn={isSignedIn}
              todayIso={today}
              expanded={agentExpanded}
              onToggleExpanded={() => setAgentExpanded((prev) => !prev)}
              onSelectStartingAction={handleSelectStartingAction}
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
              onCloseExecution={() => {
                handleCloseExecution()
                const then = afterExecutionClose.current
                afterExecutionClose.current = null
                then?.()
              }}
              executionRef={executionRef}
              onExecutionCompleted={(title) => setCompletedInSession(title)}
              onNextAfterExecution={handleNextAfterExecution}
              onOpenOccurrencePage={(itemId) =>
                navigate(`/occurrences/${itemId}`)
              }
              onCardAction={executeAction}
              onBack={handleBack}
              onReset={handleReset}
              showReset={
                nodeId !== 'opening' ||
                state.excludedIds.length > 0 ||
                history.length > 0
              }
            />

            {/* ── "For you" Section ──────────────────────────────── */}
            <section aria-labelledby="for-you-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="for-you-heading"
                  className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                >
                  For you
                </h2>
                <Link
                  to="/browse?kind=activities"
                  className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-accent hover:underline"
                >
                  <span>See all</span>
                  <ChevronRight size={14} aria-hidden />
                </Link>
              </div>

              <article className="group relative flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 rounded-3xl border border-border/50 bg-surface p-3.5 sm:p-4 shadow-xs transition-all hover:border-accent/40 hover:shadow-sm">
                <div className="relative aspect-[4/3] w-full sm:w-44 shrink-0 overflow-hidden rounded-2xl bg-surface-muted">
                  <Link to={forYouItem.href} className="block h-full w-full">
                    <img
                      src={forYouItem.imageSrc}
                      alt={forYouItem.title}
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </Link>
                </div>

                <div className="flex flex-1 flex-col justify-between py-0.5 min-w-0">
                  <div>
                    <h3
                      id="featured-activity-heading"
                      className="font-display text-base sm:text-lg font-bold text-foreground group-hover:text-accent transition-colors line-clamp-1"
                    >
                      <Link to={forYouItem.href}>{forYouItem.title}</Link>
                    </h3>
                    <p className="text-xs text-muted mt-0.5">
                      {forYouItem.subtitle}
                    </p>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted leading-relaxed line-clamp-2">
                      {forYouItem.summary}
                    </p>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={forYouItem.onAction}
                      disabled={actionPending}
                      className="rounded-full bg-accent hover:bg-accent/90 text-accent-foreground px-5 py-1.5 text-xs font-semibold"
                    >
                      {forYouItem.actionLabel}
                    </Button>

                    <div className="flex items-center gap-2">
                      {forYouItem.avatars.length > 0 && (
                        <div className="flex items-center -space-x-1.5 shrink-0">
                          {forYouItem.avatars.slice(0, 3).map((av, idx) => (
                            <Avatar
                              key={idx}
                              src={av.avatarUrl}
                              name={av.displayName}
                              size="sm"
                              className="h-6 w-6 ring-2 ring-surface text-[10px]"
                            />
                          ))}
                        </div>
                      )}
                      <span className="text-xs font-medium text-muted">
                        {forYouItem.socialText}
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            </section>

            {/* ── "Explore activities" Section ────────────────────── */}
            <section aria-labelledby="activities-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="activities-heading"
                  className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                >
                  Explore activities
                </h2>
                <Link
                  to="/browse?kind=activities"
                  className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-accent hover:underline"
                >
                  <span>See all</span>
                  <ChevronRight size={14} aria-hidden />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Link
                  to="/browse?kind=activities"
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-surface p-2.5 sm:p-3 transition-all hover:border-accent/40 hover:shadow-xs"
                >
                  <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-surface-muted">
                    <img
                      src="/assets/covers/starter-jog-one-mile.jpg"
                      alt="Running groups"
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-2.5">
                    <h3 className="font-display text-xs sm:text-sm font-bold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                      Running groups
                    </h3>
                    <p className="text-[11px] sm:text-xs text-muted line-clamp-1 mt-0.5">
                      Get moving together
                    </p>
                  </div>
                </Link>

                <Link
                  to="/browse?kind=activities"
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/40 bg-surface p-2.5 sm:p-3 transition-all hover:border-accent/40 hover:shadow-xs"
                >
                  <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-surface-muted">
                    <img
                      src="/assets/covers/starter-attend-learning-event.jpg"
                      alt="Creative activities"
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="mt-2.5">
                    <h3 className="font-display text-xs sm:text-sm font-bold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                      Creative activities
                    </h3>
                    <p className="text-[11px] sm:text-xs text-muted line-clamp-1 mt-0.5">
                      Make something new
                    </p>
                  </div>
                </Link>
              </div>
            </section>

            {/* ── "Programs to follow" Section ────────────────────── */}
            <section aria-labelledby="programs-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="programs-heading"
                  className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground"
                >
                  Programs to follow
                </h2>
                <Link
                  to="/browse?kind=programs"
                  className="inline-flex items-center gap-0.5 text-xs sm:text-sm font-semibold text-accent hover:underline"
                >
                  <span>Explore</span>
                  <ChevronRight size={14} aria-hidden />
                </Link>
              </div>

              <Link
                to={programItem.href}
                className="group flex items-center justify-between gap-3.5 sm:gap-4 rounded-3xl border border-border/50 bg-surface p-3.5 sm:p-4 shadow-xs transition-all hover:border-accent/40 hover:shadow-sm"
              >
                <div className="relative aspect-[4/3] w-24 sm:w-32 shrink-0 overflow-hidden rounded-2xl bg-surface-muted">
                  <img
                    src={programItem.imageSrc}
                    alt={programItem.title}
                    className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                </div>

                <div className="flex flex-1 flex-col justify-center min-w-0">
                  <h3 className="font-display text-sm sm:text-base font-bold text-foreground group-hover:text-accent transition-colors line-clamp-1">
                    {programItem.title}
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    {programItem.subtitle}
                  </p>
                  <p className="mt-1 text-xs sm:text-sm text-muted leading-relaxed line-clamp-2">
                    {programItem.summary}
                  </p>
                </div>

                <ChevronRight
                  size={18}
                  className="text-muted group-hover:text-accent transition-colors shrink-0 mr-1"
                  aria-hidden
                />
              </Link>
            </section>
          </>
        )}
      </main>

      <HomeBottomNav />

      {scheduleTarget && (
        <ScheduleDialog
          target={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
        />
      )}
    </div>
  )
}
