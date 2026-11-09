import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { ProgramStep } from '../types'

export function useWorkspaceStep() {
  const { step: pathStep } = useParams()
  const [params, setParams] = useSearchParams()

  const stepParam = pathStep || params.get('step')
  const panelParam = params.get('panel')

  // Map step param or legacy panel param into a valid 3-step ProgramStep
  const currentStep: ProgramStep = useMemo(() => {
    if (stepParam === 'details' || stepParam === '1') return 'details'
    if (stepParam === 'activities' || stepParam === '2') return 'activities'
    if (stepParam === 'publish' || stepParam === '3' || stepParam === '4') return 'publish'

    if (panelParam === 'edit') return 'details'
    if (panelParam === 'activities') return 'activities'
    if (panelParam === 'publish') return 'publish'

    return 'details'
  }, [stepParam, panelParam])

  const setStep = (next: ProgramStep) => {
    setParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev)
        nextParams.delete('panel')
        nextParams.set('step', next)
        return nextParams
      },
      { replace: false },
    )
  }

  return {
    currentStep,
    setStep,
    panelParam,
  }
}

