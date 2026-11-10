// The one admin table: search, select filters, row and bulk actions, and paging, driven entirely by
// a resource's `list` definition. Top-level tables keep search and filters in the URL; embedded ones
// (inside an editor) take fixed filters and keep their own state.
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { adminKey } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { ActionButtons, useActionRunner } from './actions'
import type { ListQuery, Resource } from '../types'

const PAGE = 25

function useListState(resource: Resource, fixed: ListQuery | undefined, urlState: boolean) {
  const [params, setParams] = useSearchParams()
  const [local, setLocal] = useState<ListQuery>({})
  const keys = ['q', ...(resource.list!.filters ?? []).map((f) => f.key)]
  const chosen: ListQuery = urlState ? Object.fromEntries(keys.filter((k) => params.get(k)).map((k) => [k, params.get(k)!])) : local
  const set = (key: string, value: string) => {
    if (!urlState) return setLocal((cur) => ({ ...cur, [key]: value || undefined }))
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }
  return { chosen, set, query: { ...chosen, ...fixed } }
}

/** Query values are strings in the URL; booleans and numbers are restored before the call. */
const typed = (q: ListQuery) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : v]))

export function ResourceTable({ resource, fixed, urlState = false, title }: { resource: Resource; fixed?: ListQuery; urlState?: boolean; title?: string }) {
  const list = resource.list!
  const { chosen, set, query } = useListState(resource, fixed, urlState)
  const [search, setSearch] = useState(String(chosen.q ?? ''))
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const queryKey = JSON.stringify(query)

  useEffect(() => {
    const t = setTimeout(() => search !== String(chosen.q ?? '') && set('q', search.trim()), 300)
    return () => clearTimeout(t)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps
  // A new search or filter starts at the first page with nothing selected.
  useEffect(() => (setCursors([undefined]), setSelected(new Set())), [queryKey])

  const cursor = cursors.at(-1)
  const result = list.useList(typed({ ...query, limit: PAGE, ...(cursor ? { cursor } : {}) }) as never)
  const rows = result.data?.data ?? []
  const actions = list.actions ?? []
  const runner = useActionRunner(actions)
  const bulk = useBulk(resource, rows, selected, () => setSelected(new Set()))
  const href = (row: unknown) => list.rowHref?.(row) ?? (resource.editor ? `/admin/${resource.path}/${list.rowId(row)}` : undefined)
  const filters = (list.filters ?? []).filter((f) => !(fixed && f.key in fixed))
  const toggle = (id: string) => setSelected((cur) => (cur.has(id) ? (cur.delete(id), new Set(cur)) : new Set(cur.add(id))))

  return (
    <section className="space-y-4" aria-label={title ?? resource.label}>
      {title && <h2 className="text-lg font-semibold">{title}</h2>}
      <div className="admin-toolbar">
        {list.search && <Input type="search" aria-label={list.search} placeholder={list.search} value={search} onChange={(e) => setSearch(e.target.value)} className="admin-toolbar__search" />}
        {filters.map((f) => (
          <Select key={f.key} aria-label={f.label} value={String(chosen[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} className="admin-toolbar__filter">
            <option value="">{f.label}: {f.allLabel ?? 'all'}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {!fixed && list.links && (
          <div className="admin-toolbar__links">
            {list.links.map((l) => (
              <Link key={l.href} to={l.href} className={cn('btn btn--sm', l.primary ? 'btn--primary' : 'btn--outline')}>
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      {bulk.bar}
      <ErrorMessage error={result.error} retry={() => void result.refetch()} />
      {result.isPending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="admin-empty">{list.empty ?? `No ${resource.label.toLowerCase()} match.`}</p>
      ) : (
        <table className={cn('admin-table', result.isPlaceholderData && 'opacity-60')}>
          <thead>
            <tr>
              {list.bulk && (
                <th className="admin-table__check">
                  <input type="checkbox" aria-label="Select all on this page" checked={rows.length > 0 && rows.every((r) => selected.has(list.rowId(r)))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map(list.rowId)) : new Set())} />
                </th>
              )}
              {list.columns.map((c) => (
                <th key={c.key} data-priority={c.priority}>
                  {c.label}
                </th>
              ))}
              {actions.length > 0 && <th className="sr-only">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = list.rowId(row)
              const to = href(row)
              return (
                <tr key={id}>
                  {list.bulk && (
                    <td className="admin-table__check">
                      <input type="checkbox" aria-label="Select row" checked={selected.has(id)} onChange={() => toggle(id)} />
                    </td>
                  )}
                  {list.columns.map((c, i) => (
                    <td key={c.key} data-label={c.label} data-priority={c.priority}>
                      {i === 0 && to ? (
                        <Link to={to} className="admin-table__primary">
                          {c.render(row)}
                        </Link>
                      ) : (
                        c.render(row)
                      )}
                    </td>
                  ))}
                  {actions.length > 0 && (
                    <td className="admin-table__actions">
                      <ActionButtons actions={actions} row={row} runner={runner} />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {(cursors.length > 1 || result.data?.meta.hasMore) && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={cursors.length <= 1} onClick={() => setCursors((c) => c.slice(0, -1))}>
            Previous
          </Button>
          <Button size="sm" variant="outline" disabled={!result.data?.meta.hasMore} onClick={() => setCursors((c) => [...c, result.data!.meta.nextCursor ?? undefined])}>
            Next
          </Button>
        </div>
      )}
      {runner.dialog}
    </section>
  )
}

/** Bulk actions over the selected rows of the current page, run one at a time with a summary. */
function useBulk(resource: Resource, rows: unknown[], selected: Set<string>, clear: () => void) {
  const list = resource.list!
  const defs = list.bulk ?? []
  const runners = defs.map((b) => b.useRun())
  const cache = useQueryClient()
  const [running, setRunning] = useState<string | null>(null)
  const picked = useMemo(() => rows.filter((r) => selected.has(list.rowId(r))), [rows, selected, list])
  if (!defs.length || picked.length === 0) return { bar: null }

  async function run(index: number) {
    const def = defs[index]!
    const targets = picked.filter((r) => def.when?.(r) ?? true)
    if (!targets.length) {
      toast.error(`None of the selected rows can be: ${def.label.toLowerCase()}`)
      return
    }
    if (def.confirm && !window.confirm(`${def.confirm}\n\n${targets.length} selected.`)) return
    setRunning(def.label)
    const failures: string[] = []
    for (const row of targets) {
      try {
        await runners[index]!(row)
      } catch (err) {
        failures.push(err instanceof Error ? err.message : 'failed')
      }
    }
    await cache.invalidateQueries({ queryKey: adminKey })
    setRunning(null)
    const done = targets.length - failures.length
    if (failures.length) toast.error(`${def.label}: ${done} done, ${failures.length} failed. ${failures[0]}`)
    else toast.success(`${def.label}: ${done} done`)
    clear()
  }

  return {
    bar: (
      <div className="admin-bulk" role="region" aria-label="Selection">
        <span className="text-sm font-semibold">{picked.length} selected</span>
        {defs.map((d, i) => (
          <Button key={d.label} size="sm" loading={running === d.label} disabled={!!running} onClick={() => void run(i)}>
            {d.label}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={clear}>
          Clear
        </Button>
      </div>
    ),
  }
}
