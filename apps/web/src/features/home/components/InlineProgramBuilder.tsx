import { useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useProgramWorkspace } from '@project/sdk'
import { ProgramCreateForm } from '@/components/program-authoring/ProgramCreateForm'
import { ProgramStepper } from '@/components/program/ProgramStepper'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { LoadedWorkspaceLibraryBrowser } from '@/pages/Browse'
import { TitleEditor } from '@/pages/program-workspace/components/steps/TitleEditor'
import { DetailsStep } from '@/pages/program-workspace/components/steps/DetailsStep'
import { ActivitiesStep } from '@/pages/program-workspace/components/steps/ActivitiesStep'
import { PublishStep } from '@/pages/program-workspace/components/steps/PublishStep'
import type { ProgramBuilderState } from '../engine/types'

/**
 * Home's Create a Program builder (03-UX §2a). Not a second authoring system: the Add Program form,
 * then the Workspace's own title editor, stepper and three steps (03-UX §4), with the step and the
 * library picker held in Home's saved state instead of the URL. Drafts autosave on the server;
 * only the Publish step's explicit Publish publishes.
 */
export function InlineProgramBuilder({
  builder,
  onChange,
  onExit,
  onPublished,
}: {
  builder: ProgramBuilderState
  onChange: (next: ProgramBuilderState) => void
  /** Leave the builder; a created draft stays and is resumable. */
  onExit: () => void
  onPublished: (programId: string) => void
}) {
  const [, setParams] = useSearchParams()
  const workspace = useProgramWorkspace(builder.programId ?? '', Boolean(builder.programId))
  const step = builder.step ?? 'activities'
  const go = (patch: Partial<ProgramBuilderState>) => {
    onChange({ ...builder, ...patch })
    window.scrollTo({ top: 0 })
  }

  const header = (label: string, exitLabel: string, onLeave = onExit) => (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <Button variant="outline" size="sm" onClick={onLeave}>
        {exitLabel}
      </Button>
    </div>
  )

  if (!builder.programId) {
    return (
      <section aria-label="Create a Program" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        {header('Create a Program', 'Cancel')}
        <ProgramCreateForm
          typeId={builder.typeId ?? ''}
          onTypeChange={(typeId) => onChange({ ...builder, typeId })}
          loginReturnTo="/"
          onCreated={(programId) => go({ programId, typeId: undefined, step: 'activities' })}
        />
      </section>
    )
  }

  const ws = workspace.data
  if (!ws) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {header('Create a Program', 'Exit')}
        <ErrorMessage error={workspace.error} retry={() => void workspace.refetch()} />
        {workspace.isPending && <Loading />}
      </section>
    )
  }

  if (builder.picking) {
    // The library writes its filters into the URL; clear them when the picker closes.
    const closePicker = () => {
      setParams({}, { replace: true })
      go({ picking: false })
    }
    return (
      <section aria-label="Add Activities" className="flex w-full flex-col gap-3 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={closePicker}
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition hover:text-inherit"
          >
            <ArrowLeft size={16} aria-hidden />
            Back to {ws.title || 'your Program'}
          </button>
        </div>
        <LoadedWorkspaceLibraryBrowser ws={ws} returnTo="/" onDone={closePicker} />
      </section>
    )
  }

  return (
    <section aria-label="Create a Program" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      {header(ws.status === 'DRAFT' ? 'Draft · saved as you go' : 'Editing', 'Save draft & exit')}
      <TitleEditor key={ws.id} ws={ws} />
      <ProgramStepper currentStep={step} onSelectStep={(next) => go({ step: next })} />
      {step === 'details' && <DetailsStep ws={ws} onContinue={() => go({ step: 'activities' })} />}
      {step === 'activities' && (
        <ActivitiesStep
          ws={ws}
          returnTo="/"
          onBack={() => go({ step: 'details' })}
          onContinue={() => go({ step: 'publish' })}
          onBrowseLibrary={() => go({ picking: true })}
        />
      )}
      {step === 'publish' && (
        <PublishStep ws={ws} onBack={() => go({ step: 'activities' })} onPublished={() => onPublished(ws.id)} />
      )}
    </section>
  )
}
