import { useCallback } from 'react'
import type { AddRepoDialogStep } from './add-repo-dialog-types'

type UseAddRepoDialogNavParams = {
  step: AddRepoDialogStep
  isAdding: boolean
  setStep: (step: AddRepoDialogStep) => void
  resetState: () => void
  closeModal: () => void
  trackNestedBackAction: () => void
}

// Back/close navigation for the Add-a-project dialog, split out of AddRepoDialog
// to keep that orchestrator under its line budget. Back from a top-level kind
// step ('add'/'structured') returns to the kind chooser; deeper sub-steps tear
// down flow state via resetState.
export function useAddRepoDialogNav({
  step,
  isAdding,
  setStep,
  resetState,
  closeModal,
  trackNestedBackAction
}: UseAddRepoDialogNavParams): {
  handleBack: () => void
  handleOpenChange: (open: boolean) => void
} {
  const handleBack = useCallback(() => {
    if (step === 'add' || step === 'structured') {
      setStep('kind')
      return
    }
    if (step === 'nested') {
      trackNestedBackAction()
    }
    resetState()
  }, [resetState, setStep, step, trackNestedBackAction])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (step === 'nested' && !isAdding) {
          trackNestedBackAction()
        }
        closeModal()
        resetState()
      }
    },
    [closeModal, isAdding, resetState, step, trackNestedBackAction]
  )

  return { handleBack, handleOpenChange }
}
