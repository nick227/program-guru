// Small cell renderers and option lists shared by resource definitions.
import { Link } from 'react-router-dom'
import { useAdminList } from '@project/sdk'
import type { Option } from '../types'

export const options = (values: readonly string[], label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ')): Option[] => values.map((value) => ({ value, label: label(value) }))
export const yesNo: Option[] = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
]

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
export const date = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : '—')
export const dateTime = (iso: string | null | undefined) => (iso ? dateTimeFormat.format(new Date(iso)) : '—')
export const money = (minor: number, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(minor / 100)
export const label = (v: string) => v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ')

export function Person({ person }: { person: { id: string; handle: string | null; displayName: string; email?: string } | null }) {
  if (!person) return <span className="text-muted">Program Guru</span>
  return (
    <Link to={`/admin/users/${person.id}`} className="hover:text-accent">
      {person.displayName}
      {person.handle && <span className="text-muted"> @{person.handle}</span>}
    </Link>
  )
}

export function ProgramLink({ program }: { program: { id: string; title: string; isPlatform: boolean } }) {
  return (
    <Link to={program.isPlatform ? `/admin/programs/${program.id}` : `/programs/${program.id}`} className="hover:text-accent">
      {program.title}
    </Link>
  )
}

/** Reference-field search over admin lists: people by name/handle/email, Programs by title. */
export function useUserSearch(q: string) {
  const r = useAdminList('/admin/users', { q, limit: 8 }, { enabled: !!q })
  return { isLoading: r.isFetching, options: (r.data?.data ?? []).map((u) => ({ value: u.id, label: `${u.displayName}${u.handle ? ` @${u.handle}` : ''} · ${u.email}` })) }
}
export function useProgramSearch(q: string) {
  const r = useAdminList('/admin/content', { q, kind: 'PROGRAM', limit: 8 }, { enabled: !!q })
  return { isLoading: r.isFetching, options: (r.data?.data ?? []).map((p) => ({ value: p.id, label: `${p.title} · ${p.creator ? `@${p.creator.handle}` : 'Program Guru'}` })) }
}
