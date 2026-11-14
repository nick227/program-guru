import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, Search, X } from 'lucide-react'
import {
  useActivities,
  useAddCalendarItem,
  useCategories,
  useCreateActivity,
  type components,
} from '@project/sdk'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/shared/CategoryIcon'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { resolveActivityCategory } from '@/lib/activityCategory'
import { useOnline } from '@/lib/useOnline'
import { cn } from '@/lib/utils'

type S = components['schemas']

export function InlineActivityPicker({
  day,
  localTime,
  onScheduled,
  onClose,
}: {
  day: string
  localTime: string | null
  onScheduled?: (itemId: string) => void
  onClose: () => void
}) {
  const online = useOnline()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const addKeyRef = useRef(crypto.randomUUID())

  const activitiesQuery = useActivities(debounced)
  const categoriesQuery = useCategories()
  const addCalendarItem = useAddCalendarItem()
  const createActivity = useCreateActivity()

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 180)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onPointerDown)
    }
  }, [onClose])

  const categories = categoriesQuery.data ?? []
  useEffect(() => {
    if (!newCategoryId && categories.length > 0) {
      setNewCategoryId(categories[0]!.id)
    }
  }, [categories, newCategoryId])

  const activities = useMemo(() => {
    const pages = activitiesQuery.data?.pages ?? []
    const seen = new Set<string>()
    const list: S['ActivitySummary'][] = []
    for (const page of pages) {
      for (const act of page.data) {
        if (seen.has(act.id)) continue
        seen.add(act.id)
        list.push(act)
      }
    }
    return list
  }, [activitiesQuery.data])

  const busy = addCalendarItem.isPending || createActivity.isPending

  async function scheduleActivity(activityId: string, title: string) {
    if (!online || busy) return
    try {
      const result = await addCalendarItem.mutateAsync({
        activityId,
        localDate: day,
        ...(localTime ? { localTime } : {}),
        idempotencyKey: addKeyRef.current,
      })
      addKeyRef.current = crypto.randomUUID()
      toast.success(`Scheduled ${title}`)
      onScheduled?.(result.item.id)
      onClose()
    } catch {
      // ErrorMessage displays mutation error below.
    }
  }

  async function handleCreateAndSchedule(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed || !newCategoryId || !online || busy) return
    try {
      const created = await createActivity.mutateAsync({
        title: trimmed,
        categoryId: newCategoryId,
        focusIds: [],
        targetTime: localTime,
      })
      await scheduleActivity(created.id, created.title)
    } catch {
      // ErrorMessage displays mutation error below.
    }
  }

  return (
    <div
      ref={containerRef}
      className="calendar-inline-picker"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Schedule an activity"
    >
      <div className="calendar-inline-picker__trigger">
        <Search size={14} className="shrink-0 text-muted" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Add activity..."
          aria-label="Search activities to schedule"
          className="calendar-inline-picker__input"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close activity picker"
          className="calendar-inline-picker__close"
        >
          {search ? <X size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      <div className="calendar-inline-picker__popover">
        <ErrorMessage error={addCalendarItem.error || createActivity.error} />

        {!creating ? (
          <>
            <div className="calendar-inline-picker__list" role="listbox" aria-label="Matching activities">
              {activitiesQuery.isPending ? (
                <div className="py-3 text-center">
                  <Loading />
                </div>
              ) : activities.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted">
                  No matching activities found.
                </p>
              ) : (
                activities.map((activity) => {
                  const cat = resolveActivityCategory(activity.title, '')
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      disabled={!online || busy}
                      onClick={() => void scheduleActivity(activity.id, activity.title)}
                      className="calendar-inline-picker__option"
                    >
                      <span
                        className="calendar-inline-picker__option-icon"
                        data-category={cat}
                        aria-hidden
                      >
                        <CategoryIcon category={cat} size={14} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground">
                        {activity.title}
                      </span>
                      {activity.durationMinutes ? (
                        <span className="shrink-0 text-[11px] text-muted">
                          {activity.durationMinutes}m
                        </span>
                      ) : null}
                    </button>
                  )
                })
              )}
            </div>

            <div className="calendar-inline-picker__footer">
              <button
                type="button"
                onClick={() => {
                  setNewTitle(search.trim())
                  setCreating(true)
                }}
                className="calendar-inline-picker__create-btn"
              >
                <Plus size={14} aria-hidden />
                <span>
                  {search.trim()
                    ? `Create "${search.trim()}"`
                    : 'Create new activity'}
                </span>
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => void handleCreateAndSchedule(e)}
            className="space-y-2.5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                New activity
              </span>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Back
              </button>
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Activity title"
              required
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            {categories.length > 0 && (
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
                aria-label="Domain"
                className={cn(
                  'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none',
                )}
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={!online || !newTitle.trim() || !newCategoryId || busy}
              loading={busy}
            >
              Create &amp; Schedule
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
