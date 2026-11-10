// Structured import: paste or load JSON, validate on the server (a dry run reports every issue),
// then commit. Nothing is saved until the payload validates; one idempotency key per validated
// payload makes a retried commit return the original result instead of creating duplicates.
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '@project/sdk'
import { Back } from '@/components/shared/Navigation'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/Feedback'
import { Textarea } from '@/components/ui/Textarea'
import { useDocumentTitle } from '@/lib/title'
import { usePwaReloadBlocker } from '@/lib/pwaSafety'
import { backTo } from './ResourceEditor'
import type { ImportResult, Resource } from '../types'

type Stage = { kind: 'editing' } | { kind: 'checked'; result: ImportResult; key: string } | { kind: 'imported'; result: ImportResult }

/** Issues from a dry run, or the schema's own fieldErrors when the shape is wrong. */
function issuesOf(err: unknown) {
  if (err instanceof ApiError && err.fieldErrors) return Object.entries(err.fieldErrors).map(([path, message]) => ({ path, message }))
  return null
}

export function ResourceImport({ resource, all }: { resource: Resource; all: Resource[] }) {
  const def = resource.import!
  const run = def.useImport()
  const [text, setText] = useState(def.example)
  const [stage, setStage] = useState<Stage>({ kind: 'editing' })
  const [error, setError] = useState<unknown>(null)
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([])
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const back = backTo(resource, all)
  useDocumentTitle(`Admin · ${def.title}`)
  usePwaReloadBlocker(busy)

  const edit = (next: string) => (setText(next), setStage({ kind: 'editing' }), setIssues([]), setError(null))

  async function call(dryRun: boolean) {
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch (err) {
      setIssues([{ path: 'JSON', message: err instanceof Error ? err.message : 'is not valid JSON' }])
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (dryRun) {
        const result = await run(payload, { dryRun: true })
        setIssues(result.issues)
        setStage(result.valid ? { kind: 'checked', result, key: crypto.randomUUID() } : { kind: 'editing' })
      } else if (stage.kind === 'checked') {
        const result = await run(payload, { dryRun: false, idempotencyKey: stage.key })
        setStage({ kind: 'imported', result })
      }
    } catch (err) {
      const fromSchema = issuesOf(err)
      if (fromSchema) (setIssues(fromSchema), setStage({ kind: 'editing' }))
      else setError(err) // network or server failure: the same key makes Retry safe
    } finally {
      setBusy(false)
    }
  }

  const result = stage.kind === 'editing' ? null : stage.result
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        <Back to={back.href}>{back.label}</Back>
        <h1 className="text-2xl font-bold tracking-tight">{def.title}</h1>
        <div className="text-sm text-muted">{def.description}</div>
      </header>

      <section className="admin-section space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="admin-import-json" className="label">
            JSON
          </label>
          <div className="flex gap-2">
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) edit(await f.text())
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="outline" onClick={() => file.current?.click()}>
              Load file
            </Button>
            <Button size="sm" variant="ghost" onClick={() => edit(def.example)}>
              Reset to example
            </Button>
          </div>
        </div>
        <Textarea id="admin-import-json" className="font-mono text-xs" rows={18} spellCheck={false} value={text} onChange={(e) => edit(e.target.value)} disabled={stage.kind === 'imported'} />
        {stage.kind !== 'imported' && (
          <div className="flex flex-wrap gap-3">
            <Button variant={stage.kind === 'checked' ? 'outline' : 'default'} loading={busy && stage.kind === 'editing'} disabled={busy} onClick={() => void call(true)}>
              Validate
            </Button>
            <Button loading={busy && stage.kind === 'checked'} disabled={busy || stage.kind !== 'checked'} onClick={() => void call(false)}>
              {stage.kind === 'checked' ? `Import ${stage.result.rows.length} as drafts` : 'Import as drafts'}
            </Button>
          </div>
        )}
        <ErrorMessage error={error} retry={stage.kind === 'checked' ? () => void call(false) : undefined} />
      </section>

      {issues.length > 0 && (
        <section className="admin-section" aria-labelledby="admin-import-issues">
          <h2 id="admin-import-issues" className="text-lg font-semibold text-danger">
            {issues.length} {issues.length === 1 ? 'problem' : 'problems'}. Nothing was saved.
          </h2>
          <ul className="mt-3 space-y-1 text-sm">
            {issues.map((i) => (
              <li key={`${i.path}:${i.message}`}>
                <code className="text-xs">{i.path}</code> {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <section className="admin-section" aria-labelledby="admin-import-result">
          <h2 id="admin-import-result" className="text-lg font-semibold">
            {stage.kind === 'imported' ? `Imported ${result.rows.length} drafts` : 'Ready to import'}
          </h2>
          <ul className="mt-3 divide-y divide-border/60">
            {result.rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                {r.href ? (
                  <Link to={r.href} className="font-semibold hover:text-accent">
                    {r.title}
                  </Link>
                ) : (
                  <span className="font-semibold">{r.title}</span>
                )}
                <span className="text-muted">{r.detail}</span>
              </li>
            ))}
          </ul>
          {stage.kind === 'imported' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to={def.reviewHref} className="btn btn--primary btn--md">
                Review drafts
              </Link>
              <Button variant="outline" onClick={() => edit(def.example)}>
                Import more
              </Button>
            </div>
          )}
        </section>
      )}
    </article>
  )
}
