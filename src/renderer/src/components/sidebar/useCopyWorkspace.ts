import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'

// Copying a workspace clones an existing iteration (its sandbox service set and
// mounted repos) into a fresh workspace under the same project. Distinct from
// the "new workspace" wizard: the source is fixed, only the new name is entered.
export type CopyWorkspace = {
  isOpen: boolean
  project: string
  source: string
  name: string
  setName: (value: string) => void
  busy: boolean
  error: string | null
  clearError: () => void
  handleCopy: () => void
  handleOpenChange: (open: boolean) => void
}

export function useCopyWorkspace(): CopyWorkspace {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const settings = useAppStore((s) => s.settings)
  const fetchReposForAllHosts = useAppStore((s) => s.fetchReposForAllHosts)
  const fetchProjectGroupsForAllHosts = useAppStore((s) => s.fetchProjectGroupsForAllHosts)
  const fetchFolderWorkspacesForAllHosts = useAppStore((s) => s.fetchFolderWorkspacesForAllHosts)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)
  const mountedRef = useMountedRef()

  const isOpen = activeModal === 'copy-workspace'
  const target = useMemo(() => getActiveRuntimeTarget(settings), [settings])

  // App.tsx gate-mounts this dialog only while open, so seeding the source
  // project/workspace from modalData in the lazy initializers is safe.
  const project = typeof modalData.project === 'string' ? modalData.project : ''
  const source = typeof modalData.workspace === 'string' ? modalData.workspace : ''
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearError = useCallback(() => setError(null), [])

  const handleCopy = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed || !project || !source || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callRuntimeRpc(target, 'iteration.workspaceCopy', {
        project,
        source,
        name: trimmed
      })
      // Project the copy into orca's native records, then refresh the sidebar in
      // the same order the wizard uses: repos → groups → folder workspaces →
      // worktrees (worktrees enumerate over repos).
      await callRuntimeRpc(target, 'iteration.materialize', { project })
      await fetchReposForAllHosts()
      await fetchProjectGroupsForAllHosts()
      await fetchFolderWorkspacesForAllHosts()
      await fetchAllWorktrees()
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
      translate('auto.components.sidebar.CopyWorkspaceDialog.copiedTitle', 'Workspace copied'),
      { description: trimmed }
    )
    closeModal()
  }, [
    busy,
    closeModal,
    fetchAllWorktrees,
    fetchFolderWorkspacesForAllHosts,
    fetchProjectGroupsForAllHosts,
    fetchReposForAllHosts,
    mountedRef,
    name,
    project,
    source,
    target
  ])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return {
    isOpen,
    project,
    source,
    name,
    setName,
    busy,
    error,
    clearError,
    handleCopy,
    handleOpenChange
  }
}
