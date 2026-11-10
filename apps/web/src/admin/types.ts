// The admin resource model. A resource is a plain object: what to list, how to show and filter it,
// what can be done to a row, and how to create, edit or import records. The five shared components
// (AdminLayout, ResourceTable, ResourceForm, ResourceEditor, ResourceImport) render any resource.
// See docs/admin-resources.md.
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'

export type Page<Row> = { data: Row[]; meta: { hasMore: boolean; nextCursor: string | null } }
/** List queries are flat string/number/boolean maps, so they round-trip through the URL. */
export type ListQuery = Record<string, string | number | boolean | undefined>

export type Option = { value: string; label: string }
/** Static options, or a hook that loads them (catalog lists, dependent selects). */
export type Options<V> = Option[] | ((values: V) => Option[])

// ── Fields ──────────────────────────────────────────────────────────────────

type FieldBase<V> = {
  name: keyof V & string
  label: string
  help?: string
  required?: boolean
  /** Shown only when true; hidden fields are neither validated nor submitted. */
  visible?: (values: V) => boolean
  disabled?: (values: V) => boolean
  /**
   * Marks free text that a future field-level writing assistant may generate, improve, shorten or
   * rewrite. Nothing renders for it yet; see `fieldActions` in components/fields.tsx.
   */
  assist?: boolean
}

export type Field<V> = FieldBase<V> &
  (
    | { kind: 'text'; maxLength?: number; placeholder?: string }
    | { kind: 'textarea'; maxLength?: number; rows?: number; placeholder?: string }
    | { kind: 'number'; min?: number; max?: number; suffix?: string }
    | { kind: 'select'; options: Options<V>; placeholder?: string }
    | { kind: 'boolean' }
    | { kind: 'date' }
    /** Visibility: PRIVATE / UNLISTED / PUBLIC. */
    | { kind: 'visibility' }
    /** Program length in days; null is ongoing. */
    | { kind: 'duration' }
    /** Pick a record by searching another resource's list. */
    | { kind: 'reference'; search: (q: string) => { options: Option[]; isLoading: boolean }; placeholder?: string }
    /** Escape hatch for genuinely unique inputs. */
    | { kind: 'custom'; render: (props: FieldProps<V>) => ReactNode }
  )

export type FieldProps<V> = {
  id: string
  value: unknown
  values: V
  onChange: (value: unknown) => void
  invalid: boolean
  disabled: boolean
}

// ── Table ───────────────────────────────────────────────────────────────────

export type Column<Row> = {
  key: string
  label: string
  render: (row: Row) => ReactNode
  /** Leaves the table first as it narrows; on phones every row becomes a labelled card. */
  priority?: 'low'
}

export type Filter = {
  /** The list query key. Booleans travel as 'true' / 'false'. */
  key: string
  label: string
  options: Option[]
  /** What an empty choice means when the server has a default (e.g. reports default to open). */
  allLabel?: string
}

export type ActionContext = { reason: string }

export type Action<Row> = {
  label: string | ((row: Row) => string)
  /** Hidden unless true. */
  when?: (row: Row) => boolean
  tone?: 'danger'
  /** Ask before running. With `reason`, the confirmation also collects the audit reason. */
  confirm?: string | ((row: Row) => string)
  reason?: boolean
  /** A link… */
  href?: (row: Row) => string
  /** …or a hook returning the runner (SDK mutations are hooks). Called once per table. */
  useRun?: () => (row: Row, ctx: ActionContext) => Promise<unknown>
}

export type BulkAction<Row> = {
  label: string
  /** Rows the action applies to; others in the selection are skipped. */
  when?: (row: Row) => boolean
  confirm?: string
  useRun: () => (row: Row) => Promise<unknown>
}

// ── Records ─────────────────────────────────────────────────────────────────

export type EditorSection<Detail> = {
  key: string
  title: string
  description?: string
  when?: (record: Detail) => boolean
  render: (record: Detail) => ReactNode
}

export type Badge = { label: string; tone?: 'muted' | 'accent' | 'warning' | 'danger' }

export type EditorDef<Detail> = {
  useRecord: (id: string) => UseQueryResult<Detail>
  title: (record: Detail) => string
  subtitle?: (record: Detail) => ReactNode
  badges?: (record: Detail) => Badge[]
  actions?: Action<Detail>[]
  sections: EditorSection<Detail>[]
}

export type CreateDef<V> = {
  title: string
  fields: Field<V>[]
  initial: V
  submitLabel: string
  /** Hook returning the create call; resolves to the new record's id. */
  useCreate: () => (values: V) => Promise<string>
  /** Where to go after creating; defaults to this resource's editor. */
  next?: (id: string) => string
}

export type ImportResult = {
  valid: boolean
  issues: { path: string; message: string }[]
  rows: { key: string; title: string; detail: string; href?: string }[]
}

export type ImportDef = {
  title: string
  description: ReactNode
  /** A complete, valid example shown as the starting text. */
  example: string
  /** Hook returning the server call. Validation is the server's: dryRun reports, commit writes. */
  useImport: () => (payload: unknown, opts: { dryRun: boolean; idempotencyKey?: string }) => Promise<ImportResult>
  /** Where to review what was imported. */
  reviewHref: string
}

export type Resource<Row = any, Detail = any, Query extends ListQuery = ListQuery> = {
  /** URL segment under /admin, e.g. 'users' or 'membership/prices'. */
  path: string
  /** Which section tab it belongs to. */
  section: SectionKey
  label: string
  singular: string
  /** Shown as a tab inside its section. Editor-only resources set false. */
  nav?: boolean
  list?: {
    useList: (query: Query) => UseQueryResult<Page<Row>>
    rowId: (row: Row) => string
    /** Opens the row; defaults to this resource's editor when there is one. */
    rowHref?: (row: Row) => string | undefined
    columns: Column<Row>[]
    search?: string
    filters?: Filter[]
    actions?: Action<Row>[]
    bulk?: BulkAction<Row>[]
    /** Toolbar links, e.g. "New Program". */
    links?: { label: string; href: string; primary?: boolean }[]
    empty?: string
  }
  editor?: EditorDef<Detail>
  create?: CreateDef<any>
  import?: ImportDef
}

export type SectionKey = 'content' | 'users' | 'moderation' | 'membership'

/** Identity helper: infers Row/Detail/Query from the object while checking it against Resource. */
export const defineResource = <Row, Detail = Row, Query extends ListQuery = ListQuery>(r: Resource<Row, Detail, Query>) => r
