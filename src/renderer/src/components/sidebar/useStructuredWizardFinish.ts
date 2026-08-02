import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import { toast } from 'sonner'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import { materializeAndRefreshStructured } from './structured-materialize-refresh'
import type { SandboxServiceSelection } from './useSandboxServiceSelection'

// Owns the wizard's exit path: mount whatever repos are still queued, optionally
// apply the sandbox picks to the workspace that will run them, project the result
// into orca's native records, then close. Idempotent, so every exit (finish,
// project-only, skip) shares it.
export function useStructuredWizardFinish(args: {
  target: RuntimeClientTarget
  workspaceName: string
  sandbox: SandboxServiceSelection
  mountPendingRepos: (project: string) => Promise<boolean>
  setBusy: (value: boolean) => void
  setError: (value: string | null) => void
  closeModal: () => void
  mountedRef: MutableRefObject<boolean>
}): (project: string, options?: { applyServices?: boolean }) => Promise<void> {
  const {
    target,
    workspaceName,
    sandbox,
    mountPendingRepos,
    setBusy,
    setError,
    closeModal,
    mountedRef
  } = args

  return useCallback(
    async (project: string, options?: { applyServices?: boolean }) => {
      setBusy(true)
      setError(null)
      // Deferred adds: mount every queued folder before materializing. A failure
      // leaves the user on the step with a message and does not close.
      const mounted = await mountPendingRepos(project)
      if (!mounted) {
        if (mountedRef.current) {
          setBusy(false)
        }
        return
      }
      try {
        if (options?.applyServices && workspaceName.trim()) {
          await callRuntimeRpc(target, 'iteration.workspaceUpdate', {
            project,
            workspace: workspaceName.trim(),
            services: sandbox.toSpecs()
          })
        }
        await materializeAndRefreshStructured(target, project)
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err))
          setBusy(false)
        }
        return
      }
      if (!mountedRef.current) {
        return
      }
      toast.success(
        translate(
          'auto.components.sidebar.NewStructuredIterationDialog.finishTitle',
          'Structured iteration ready'
        ),
        { description: project }
      )
      closeModal()
    },
    [closeModal, mountPendingRepos, mountedRef, sandbox, setBusy, setError, target, workspaceName]
  )
}
