import { useState } from 'react'
import { Check, Pause, Play, RotateCcw } from 'lucide-react'
import type { components } from '@project/sdk'
import type { SessionEligibility } from '@/lib/sessionEligibility'
import { Button } from '@/components/ui/Button'

type Action = components['schemas']['SessionAction']

/** One action set for full-page, Home and Calendar execution; hosts retain their layout. */
export function SessionActions({ eligibility: e, timed, unsaved, onPerform, onUndo, undoPending, inline = false }: {
  eligibility: SessionEligibility
  timed: boolean
  unsaved: boolean
  onPerform: (action?: Action) => Promise<unknown>
  onUndo: () => void
  undoPending: boolean
  inline?: boolean
}) {
  const [pending, setPending] = useState<string | null>(null)
  async function run(key: string, action?: Action) {
    setPending(key)
    try { await onPerform(action) } finally { setPending(null) }
  }
  const size = inline ? 'md' : 'lg'
  const running = e.phase === 'active' || e.phase === 'paused'
  return <>
    {e.phase === 'ready' && <>
      {timed && <Button size={size} disabled={!e.canStart} loading={pending === 'start'} onClick={() => void run('start', 'START')}><Play size={16} aria-hidden />Start</Button>}
      <Button size={size} variant={timed ? 'outline' : 'default'} disabled={!e.canFinish} loading={pending === 'finish'} onClick={() => void run('finish', 'FINISH')}>
        <Check size={16} aria-hidden />{timed ? 'Complete without timer' : 'Mark as Complete'}
      </Button>
    </>}
    {running && <>
      <Button size={size} disabled={!e.canFinish} loading={pending === 'finish'} onClick={() => void run('finish', 'FINISH')}><Check size={16} aria-hidden />{inline ? 'Finish' : 'Complete'}</Button>
      <Button size={size} variant="outline" disabled={e.phase === 'active' ? !e.canPause : !e.canResume} loading={pending === 'toggle'} onClick={() => void run('toggle', e.phase === 'active' ? 'PAUSE' : 'RESUME')}>
        {e.phase === 'active' ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}{e.phase === 'active' ? 'Pause' : 'Resume'}
      </Button>
    </>}
    {e.phase === 'completed' && <Button size={size} variant="outline" disabled={!e.canUndo} loading={undoPending} onClick={onUndo}><RotateCcw size={16} aria-hidden />{inline ? 'Undo' : 'Undo completion'}</Button>}
    {unsaved && <Button size={size} variant="outline" disabled={!e.canSave} loading={pending === 'save'} onClick={() => void run('save')} >{inline ? 'Save' : 'Save results'}</Button>}
    {e.opensLabel && e.phase !== 'completed' && <p className="text-sm text-muted" role="note">{e.opensLabel}</p>}
  </>
}
