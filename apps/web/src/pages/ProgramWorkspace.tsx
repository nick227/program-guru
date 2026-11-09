import { useParams } from 'react-router-dom'
import { useProgramWorkspace } from '@project/sdk'
import { Page, Stage } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { ProgramStepper } from '@/components/ProgramStepper'
import { useDocumentTitle } from '@/lib/title'
import { useWorkspaceStep } from './program-workspace/hooks/useWorkspaceStep'
import { WorkspaceHeader } from './program-workspace/components/WorkspaceHeader'
import { WorkspaceBrowserOutlet } from './program-workspace/components/WorkspaceBrowserOutlet'
import { TitleEditor } from './program-workspace/components/steps/TitleEditor'
import { DetailsStep } from './program-workspace/components/steps/DetailsStep'
import { ActivitiesStep } from './program-workspace/components/steps/ActivitiesStep'
import { PublishStep } from './program-workspace/components/steps/PublishStep'

export function ProgramWorkspacePage() {
  const { id = '' } = useParams()
  const workspace = useProgramWorkspace(id)
  const { currentStep, setStep, panelParam } = useWorkspaceStep()

  useDocumentTitle(
    workspace.data?.title
      ? `Workspace: ${workspace.data.title}`
      : 'Workspace',
  )

  if (!workspace.data) {
    return (
      <Page>
        <Back to="/library">My Programs</Back>
        <ErrorMessage
          error={workspace.error}
          retry={() => void workspace.refetch()}
        />
        {workspace.isPending && <Loading />}
      </Page>
    )
  }

  const ws = workspace.data

  return (
    <Page>
      <Stage className="w-full space-y-6">
        {/* Navigation header: Back + View Program Link */}
        <WorkspaceHeader ws={ws} panelParam={panelParam} />

        {/* Title header with autosave & version CAS across all tabs */}
        <TitleEditor key={ws.id} ws={ws} />

        {/* Persistent 3-step stepper */}
        <ProgramStepper
          currentStep={currentStep}
          onSelectStep={setStep}
        />

        <ErrorMessage error={workspace.error} />

        {/* 1. DETAILS (Unified details tab content) */}
        {currentStep === 'details' && (
          <DetailsStep
            ws={ws}
            onContinue={() => setStep('activities')}
          />
        )}

        {/* 2. ACTIVITIES */}
        {currentStep === 'activities' && (
          <ActivitiesStep
            ws={ws}
            onBack={() => setStep('details')}
            onContinue={() => setStep('publish')}
          />
        )}

        {/* 3. PUBLISH & SHARE */}
        {currentStep === 'publish' && (
          <PublishStep
            ws={ws}
            onBack={() => setStep('activities')}
          />
        )}
      </Stage>
      <WorkspaceBrowserOutlet ws={ws} />
    </Page>
  )
}
