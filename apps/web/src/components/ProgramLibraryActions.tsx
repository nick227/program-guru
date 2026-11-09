import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useCopyProgram,
  useManagePersonalProgram,
  usePersonalEnrollmentAction,
  useProgramPrefetch,
} from '@project/sdk'
import { ArrowUpRight, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/Button'
import {
  programPrimaryAction,
  libraryProgramUrl,
} from '@/lib/programNavigation'
import { buildWorkspaceUrl } from '@/lib/urls'
import type { PersonalProgram } from '@/lib/programLibrary'

type Action =
  | 'REMOVE_LIBRARY'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'RESTART'
  | 'REMOVE'
  | 'ACTIVE'
  | 'PAUSED'
/** Personal participation controls; definition editing stays in the Workspace. */
export function ProgramLibraryActions({ entry }: { entry: PersonalProgram }) {
  const manage = useManagePersonalProgram()
  const enrollment = usePersonalEnrollmentAction()
  const copy = useCopyProgram()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefetch = useProgramPrefetch()
  const primary = programPrimaryAction(entry, params.toString())
  const [confirm, setConfirm] = useState<
    'RESTART' | 'REMOVE' | 'REMOVE_LIBRARY' | null
  >(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    if (confirm) dialog.current?.showModal()
  }, [confirm])
  const p = entry.program
  const r = entry.current
  const busy = manage.isPending || enrollment.isPending || copy.isPending
  const detail = libraryProgramUrl(p.id, params.toString())
  async function run(action: Action) {
    try {
      if (action === 'REMOVE_LIBRARY') {
        if (r && ['ACTIVE', 'PAUSED'].includes(r.status))
          await enrollment.mutateAsync({ id: r.id, action: 'REMOVE' })
        await manage.mutateAsync({ programId: p.id, action: 'ARCHIVE' })
      } else if (['ACTIVE', 'PAUSED', 'REMOVE'].includes(action) && r) {
        await enrollment.mutateAsync({
          id: r.id,
          action: action as 'ACTIVE' | 'PAUSED' | 'REMOVE',
        })
      } else {
        await manage.mutateAsync({
          programId: p.id,
          expectedRunId: r?.id,
          action: action as 'ARCHIVE' | 'RESTORE' | 'RESTART',
        })
      }
      setConfirm(null)
      if (menu.current) menu.current.open = false
      const messages: Record<Action, string> = {
        REMOVE_LIBRARY:
          'Program removed from your library. Completed results are preserved.',
        ARCHIVE: 'Archived. Future unstarted Activities are paused.',
        RESTORE:
          r?.status === 'PAUSED'
            ? 'Restored to Library. Your schedule is still paused; choose Resume when ready.'
            : 'Restored to Library',
        RESTART: 'New run started',
        REMOVE:
          'Future Activities removed. Your Program and history are preserved.',
        ACTIVE: 'Schedule resumed',
        PAUSED: 'Schedule paused',
      }
      toast.success(messages[action])
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update Program',
      )
    }
  }
  const warmStart = () => {
    if (primary.label === 'Start')
      prefetch(p.id, primary.href?.includes('/workspace') ? 'workspace' : 'preview')
  }
  return (
    <div className="library-actions">
      {primary.label === 'Resume' ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run('ACTIVE')}
        >
          Resume
        </Button>
      ) : (
        <Link
          className="library-open"
          to={primary.href!}
          onPointerEnter={warmStart}
          onFocus={warmStart}
        >
          {primary.label}
          <ArrowUpRight size={14} />
        </Link>
      )}
      <details
        ref={menu}
        className="library-menu"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}
      >
        <summary aria-label={`Manage ${p.title}`}>
          <MoreHorizontal size={19} />
        </summary>
        <div>
          <Link to={detail}>Details & insights</Link>
          {r?.pendingVersionId && (
            <Link
              to={`/programs/${p.id}?returnTo=${encodeURIComponent(detail)}`}
              onPointerEnter={() => prefetch(p.id)}
              onFocus={() => prefetch(p.id)}
            >
              Review update
            </Link>
          )}
          {entry.owned ? (
            <Link
              to={buildWorkspaceUrl(p.id)}
              onPointerEnter={() => prefetch(p.id, 'workspace')}
              onFocus={() => prefetch(p.id, 'workspace')}
            >
              Edit Program
            </Link>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void copy
                  .mutateAsync(p.id)
                  .then((c) => navigate(buildWorkspaceUrl(c.id)))
                  .catch((error) => toast.error(error.message))
              }
            >
              Customize a copy
            </button>
          )}
          {entry.status !== 'Archived' && r?.status === 'ACTIVE' && (
            <button disabled={busy} onClick={() => void run('PAUSED')}>
              Pause schedule
            </button>
          )}
          {entry.status !== 'Archived' &&
            r &&
            ['ACTIVE', 'PAUSED'].includes(r.status) && (
              <button disabled={busy} onClick={() => setConfirm('REMOVE')}>
                Remove from Calendar
              </button>
            )}
          {r && entry.publicationStatus === 'PUBLISHED' && (
            <button disabled={busy} onClick={() => setConfirm('RESTART')}>
              Restart as a new run
            </button>
          )}
          {entry.status !== 'Archived' && (
            <button
              className="text-danger"
              disabled={busy}
              onClick={() => setConfirm('REMOVE_LIBRARY')}
            >
              Remove from Programs
            </button>
          )}
          <p className="library-menu-note">
            {entry.status === 'Archived'
              ? r?.status === 'PAUSED'
                ? 'Restore returns this Program to your library. Its schedule stays paused until you choose Resume.'
                : 'Restore returns this Program to your library.'
              : 'Archiving pauses future unstarted Activities and keeps your history.'}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void run(entry.status === 'Archived' ? 'RESTORE' : 'ARCHIVE')
            }
          >
            {entry.status === 'Archived'
              ? 'Restore to library'
              : 'Archive personally'}
          </button>
        </div>
      </details>
      {confirm && (
        <dialog
          ref={dialog}
          onCancel={() => setConfirm(null)}
          className="library-confirm"
          aria-label={
            confirm === 'RESTART'
              ? 'Restart Program'
              : confirm === 'REMOVE_LIBRARY'
                ? 'Remove Program'
                : 'Remove from Calendar'
          }
        >
          <div>
            <h2>
              {confirm === 'RESTART'
                ? 'Start a fresh run today?'
                : confirm === 'REMOVE_LIBRARY'
                  ? 'Remove this Program from your library?'
                  : 'Remove future Activities?'}
            </h2>
            <p>
              {confirm === 'RESTART'
                ? 'A new independent run will use the same published version. Personal schedule changes will remain with your earlier run.'
                : confirm === 'REMOVE_LIBRARY'
                  ? 'Future unstarted Activities will leave your Calendar and the Program will move to Archived Programs. The source Program is not deleted.'
                  : 'Future unstarted Activities will leave your Calendar. Your Program stays in your library.'}{' '}
              Completed results and earlier history are preserved.
            </p>
            <Button disabled={busy} onClick={() => void run(confirm)}>
              {confirm === 'RESTART'
                ? 'Start new run'
                : confirm === 'REMOVE_LIBRARY'
                  ? 'Remove Program'
                  : 'Remove future Activities'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        </dialog>
      )}
    </div>
  )
}
