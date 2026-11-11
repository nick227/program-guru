import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  useCopyProgram,
  useManagePersonalProgram,
  usePersonalEnrollmentAction,
  useProgramPrefetch,
} from '@project/sdk'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { DeleteProgramDialog } from '@/components/program/DeleteProgramDialog'
import {
  libraryProgramUrl,
  libraryReturnUrl,
} from '@/lib/programNavigation'
import { buildWorkspaceUrl } from '@/lib/urls'
import type { PersonalProgram } from '@/lib/programLibrary'
import '@/styles/components/program-library.css'

type Action =
  | 'REMOVE_LIBRARY'
  | 'RESTART'
  | 'REMOVE'
  | 'ACTIVE'
  | 'PAUSED'
/** Personal participation controls; definition editing lives on the Program page or Workspace. */
export function ProgramLibraryActions({
  entry,
  variant = 'table',
  onRemoved,
  onDeleted,
}: {
  entry: PersonalProgram
  variant?: 'table' | 'page'
  onRemoved?: () => void
  onDeleted?: () => void
}) {
  const manage = useManagePersonalProgram()
  const enrollment = usePersonalEnrollmentAction()
  const copy = useCopyProgram()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const prefetch = useProgramPrefetch()
  const [confirm, setConfirm] = useState<
    'RESTART' | 'REMOVE' | 'REMOVE_LIBRARY' | null
  >(null)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDetailsElement>(null)
  const p = entry.program
  const r = entry.current
  const busy = manage.isPending || enrollment.isPending || copy.isPending
  const detail = libraryProgramUrl(p.id, params.toString())
  const returnTo = libraryReturnUrl(params.toString())

  const closeMenu = () => {
    if (menu.current) menu.current.open = false
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen])
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
          action: 'RESTART',
        })
      }
      setConfirm(null)
      closeMenu()
      const messages: Record<Action, string> = {
        REMOVE_LIBRARY:
          'Program removed from your library and Calendar. Completed results are preserved.',
        RESTART: 'New run started',
        REMOVE:
          'Removed from your Calendar. Your Program and history are preserved.',
        ACTIVE: 'Schedule resumed',
        PAUSED: 'Schedule paused',
      }
      toast.success(messages[action])
      if (action === 'REMOVE_LIBRARY') {
        onRemoved?.()
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not update Program',
      )
    }
  }
  return (
    <div
      className={
        variant === 'page'
          ? 'library-actions library-actions--page'
          : 'library-actions'
      }
      onClick={(e) => e.stopPropagation()}
    >
      <details
        ref={menu}
        className="library-menu"
        onToggle={(event) => setMenuOpen(event.currentTarget.open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false
            setMenuOpen(false)
            event.currentTarget.querySelector('summary')?.focus()
          }
        }}
      >
        <summary aria-label={`Manage ${p.title}`}>
          <MoreHorizontal size={19} />
        </summary>
        <div>
          {variant === 'table' && (
            <Link
              to={detail}
              onPointerEnter={() => prefetch(p.id)}
              onFocus={() => prefetch(p.id)}
            >
              View Program
            </Link>
          )}
          {variant === 'table' && r?.pendingVersionId && (
            <Link
              to={`/programs/${p.id}?returnTo=${encodeURIComponent(returnTo)}`}
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
              {variant === 'page' ? 'Open Workspace' : 'Edit Program'}
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
          {r?.status === 'ACTIVE' && (
            <button disabled={busy} onClick={() => void run('PAUSED')}>
              Pause schedule
            </button>
          )}
          {r?.status === 'PAUSED' && (
            <button disabled={busy} onClick={() => void run('ACTIVE')}>
              Resume schedule
            </button>
          )}
          {r && ['ACTIVE', 'PAUSED'].includes(r.status) && (
            <button
              disabled={busy}
              onClick={() => {
                closeMenu()
                setConfirm('REMOVE')
              }}
            >
              Remove from Calendar
            </button>
          )}
          {r && entry.publicationStatus === 'PUBLISHED' && (
            <button
              disabled={busy}
              onClick={() => {
                closeMenu()
                setConfirm('RESTART')
              }}
            >
              Restart as a new run
            </button>
          )}
          <button
            className="text-danger"
            disabled={busy}
            onClick={() => {
              closeMenu()
              setConfirm('REMOVE_LIBRARY')
            }}
          >
            Remove from Programs
          </button>
          {entry.owned && (
            <button
              className="text-danger"
              disabled={busy}
              onClick={() => {
                closeMenu()
                setDeleting(true)
              }}
            >
              Delete Program…
            </button>
          )}
        </div>
      </details>
      {deleting && (
        <DeleteProgramDialog
          program={p}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            onDeleted?.()
          }}
        />
      )}
      {confirm && (
        <Dialog
          onClose={() => setConfirm(null)}
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
                  : 'Remove from your Calendar?'}
            </h2>
            <p>
              {confirm === 'RESTART'
                ? 'A new independent run will use the same published version. Personal schedule changes will remain with your earlier run.'
                : confirm === 'REMOVE_LIBRARY'
                  ? "All of this Program's Activities will leave your Calendar, including completed ones, and the Program will leave your library. The source Program is not deleted."
                  : "All of this Program's Activities will leave your Calendar, including completed ones. Your Program stays in your library."}{' '}
              Your completed results and history are kept in My Programs.
            </p>
            <Button disabled={busy} onClick={() => void run(confirm)}>
              {confirm === 'RESTART'
                ? 'Start new run'
                : confirm === 'REMOVE_LIBRARY'
                  ? 'Remove Program'
                  : 'Remove from Calendar'}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
