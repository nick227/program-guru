import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { type components } from '@project/sdk'
import { Page, Stage } from '@/components/ui/Layout'
import { Back } from '@/components/shared/Navigation'
import { buildBrowseUrl, clearBrowseDraft, readBrowseDraft, writeBrowseDraft } from '@/lib/browse'
import { safeReturn } from '@/lib/dates'
import { useDocumentTitle } from '@/lib/title'
import { buildWorkspaceUrl } from '@/lib/urls'
import { ProgramCreateForm, type ProgramCreateDraft } from '@/components/program-authoring/ProgramCreateForm'

type Program = components['schemas']['ProgramSummary']

const CREATE_DRAFT_KEY = 'program-create-browse-draft'


function resolveCreateBackLabel(backTo: string) {
  if (backTo.startsWith('/library')) return 'My Programs'
  if (backTo.startsWith('/browse')) return 'Community'
  if (backTo.startsWith('/@')) return 'Profile'
  if (backTo === '/' || backTo.startsWith('/?')) return 'Calendar'
  return 'Back'
}

export function ProgramCreatePage() {
  useDocumentTitle('Add Program')
  const [params, setParams] = useSearchParams()
  const backTo = safeReturn(params.get('returnTo'), '/')
  const navigate = useNavigate()
  const location = useLocation()
  const navType = useNavigationType()
  // The chosen type lives in the URL so Back, refresh and the browser keep it.
  const typeId = params.get('type') ?? ''
  const setTypeId = (next: string) =>
    setParams(
      (previous) => {
        const query = new URLSearchParams(previous)
        if (next) query.set('type', next)
        else query.delete('type')
        return query
      },
      { replace: !next },
    )
  const routeState = location.state as {
    fromBrowse?: boolean
    pickedProgram?: Program
  } | null
  const returningFromBrowse = Boolean(routeState?.fromBrowse) || navType === 'POP'
  const [initialDraft] = useState<ProgramCreateDraft | null>(() => {
    const saved = readBrowseDraft<ProgramCreateDraft>(
      CREATE_DRAFT_KEY,
      returningFromBrowse,
    )
    return saved && saved.typeId === typeId ? saved : null
  })
  const pickedProgram = routeState?.pickedProgram ?? null
  useEffect(() => {
    if (!returningFromBrowse) clearBrowseDraft(CREATE_DRAFT_KEY)
  }, [returningFromBrowse])
  useEffect(() => {
    if (pickedProgram && pickedProgram.type.id !== typeId) {
      setTypeId(pickedProgram.type.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedProgram])

  function openBrowser(snapshot: ProgramCreateDraft) {
    writeBrowseDraft<ProgramCreateDraft>(CREATE_DRAFT_KEY, snapshot)
    navigate(
      buildBrowseUrl({
        kind: 'programs',
        type: typeId,
        pick: 'program',
        returnTo: `${location.pathname}${location.search}`,
      }),
    )
  }

  return (
    <Page>
      <Stage className="w-full">
        <Back to={backTo}>{resolveCreateBackLabel(backTo)}</Back>
        <ProgramCreateForm
          typeId={typeId}
          onTypeChange={(next) => {
            clearBrowseDraft(CREATE_DRAFT_KEY)
            setTypeId(next)
          }}
          initial={pickedProgram ? { startingPoint: pickedProgram } : initialDraft}
          onBrowse={openBrowser}
          loginReturnTo="/programs/new"
          onCreated={(programId) => {
            clearBrowseDraft(CREATE_DRAFT_KEY)
            navigate(buildWorkspaceUrl(programId, { step: 'activities' }), { replace: true })
          }}
        />
      </Stage>
    </Page>
  )
}
