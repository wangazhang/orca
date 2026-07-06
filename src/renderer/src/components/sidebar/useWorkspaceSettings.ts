import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type {
  StructuredServiceKind,
  StructuredWorkspaceService,
  StructuredWorkspaceWorktree
} from '../../../../shared/structured-project-schema'
import { translate } from '@/i18n/i18n'

// One editable row in the mounted-repo list. `isNew` marks a repo picked this
// session (added via iteration.workspaceAddRepo on Save); existing rows carry
// their on-disk repoId so removal targets iteration.workspaceRemoveRepo.
export type DraftRepo = {
  key: string
  repoId: string
  branch: string
  isNew: boolean
  // Present only for `isNew` rows: the picked folder to mount from on Save.
  source?: string
}

export type WorkspaceSettings = {
  isOpen: boolean
  project: string
  workspace: string
  loading: boolean
  loadError: string | null
  services: Set<StructuredServiceKind>
  toggleService: (kind: StructuredServiceKind) => void
  repos: DraftRepo[]
  removeRepo: (key: string) => void
  handleAddRepo: () => void
  adding: boolean
  busy: boolean
  error: string | null
  handleSave: () => void
  handleOpenChange: (open: boolean) => void
}

export function useWorkspaceSettings(): WorkspaceSettings {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const settings = useAppStore((s) => s.settings)
  const fetchReposForAllHosts = useAppStore((s) => s.fetchReposForAllHosts)
  const fetchProjectGroupsForAllHosts = useAppStore((s) => s.fetchProjectGroupsForAllHosts)
  const fetchFolderWorkspacesForAllHosts = useAppStore((s) => s.fetchFolderWorkspacesForAllHosts)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)
  const mountedRef = useMountedRef()

  const isOpen = activeModal === 'workspace-settings'
  const target = useMemo(() => getActiveRuntimeTarget(settings), [settings])

  const project = typeof modalData.project === 'string' ? modalData.project : ''
  const workspace = typeof modalData.workspace === 'string' ? modalData.workspace : ''

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Draft state — the loaded snapshot is the baseline; Save diffs against it.
  const [initialServices, setInitialServices] = useState<Set<StructuredServiceKind>>(new Set())
  const [services, setServices] = useState<Set<StructuredServiceKind>>(new Set())
  const [initialRepoIds, setInitialRepoIds] = useState<Set<string>>(new Set())
  const [repos, setRepos] = useState<DraftRepo[]>([])
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the workspace's current services + mounted repos from disk on open.
  useEffect(() => {
    if (!isOpen || !project || !workspace) {
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void (async () => {
      try {
        const result = await callRuntimeRpc<{
          project?: {
            workspaces?: {
              name: string
              services?: StructuredWorkspaceService[]
              worktrees?: StructuredWorkspaceWorktree[]
            }[]
          }
        }>(target, 'iteration.get', { project })
        if (cancelled || !mountedRef.current) {
          return
        }
        const ws = result.project?.workspaces?.find((entry) => entry.name === workspace)
        const loadedServices = new Set((ws?.services ?? []).map((service) => service.kind))
        const loadedRepos: DraftRepo[] = (ws?.worktrees ?? []).map((worktree) => ({
          key: worktree.repoId,
          repoId: worktree.repoId,
          branch: worktree.branch ?? '',
          isNew: false
        }))
        setInitialServices(loadedServices)
        setServices(new Set(loadedServices))
        setInitialRepoIds(new Set(loadedRepos.map((repo) => repo.repoId)))
        setRepos(loadedRepos)
        setLoading(false)
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setLoadError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, project, workspace, target, mountedRef])

  const toggleService = useCallback((kind: StructuredServiceKind) => {
    setServices((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
    setError(null)
  }, [])

  const removeRepo = useCallback((key: string) => {
    setRepos((prev) => prev.filter((repo) => repo.key !== key))
    setError(null)
  }, [])

  // Pick a local folder and validate it is a Git repo before staging the mount;
  // the actual worktree is created on Save via iteration.workspaceAddRepo.
  const handleAddRepo = useCallback(async () => {
    if (adding || busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (!dir) {
      return
    }
    setAdding(true)
    setError(null)
    try {
      const check = await callRuntimeRpc<{ isGitRepo: boolean; repoName: string }>(
        target,
        'iteration.checkGitRepo',
        { path: dir }
      )
      if (!mountedRef.current) {
        return
      }
      if (!check.isGitRepo) {
        setError(
          translate(
            'auto.components.sidebar.WorkspaceSettingsDialog.notGitFolder',
            'That folder is not a Git repository.'
          )
        )
        return
      }
      setRepos((prev) => [
        ...prev,
        { key: dir, repoId: check.repoName, branch: '', isNew: true, source: dir }
      ])
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (mountedRef.current) {
        setAdding(false)
      }
    }
  }, [adding, busy, target, mountedRef])

  const servicesChanged = useMemo(() => {
    if (services.size !== initialServices.size) {
      return true
    }
    for (const kind of services) {
      if (!initialServices.has(kind)) {
        return true
      }
    }
    return false
  }, [services, initialServices])

  // Apply the draft as a diff: service set (if changed), each staged add, each
  // removed existing repo. Fail-fast on the first error so the dialog stays open
  // with a message and disk reflects whatever partial edits succeeded.
  const handleSave = useCallback(async () => {
    if (busy || !project || !workspace) {
      return
    }
    const addedRepos = repos.filter((repo) => repo.isNew && repo.source)
    const removedRepoIds = [...initialRepoIds].filter(
      (id) => !repos.some((repo) => !repo.isNew && repo.repoId === id)
    )
    setBusy(true)
    setError(null)
    try {
      if (servicesChanged) {
        await callRuntimeRpc(target, 'iteration.workspaceUpdate', {
          project,
          workspace,
          services: [...services]
        })
      }
      for (const repo of addedRepos) {
        await callRuntimeRpc(target, 'iteration.workspaceAddRepo', {
          project,
          workspace,
          source: repo.source
        })
      }
      for (const repoId of removedRepoIds) {
        await callRuntimeRpc(target, 'iteration.workspaceRemoveRepo', {
          project,
          workspace,
          repoId
        })
      }
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
      translate('auto.components.sidebar.WorkspaceSettingsDialog.savedTitle', 'Workspace updated'),
      { description: workspace }
    )
    closeModal()
  }, [
    busy,
    closeModal,
    fetchAllWorktrees,
    fetchFolderWorkspacesForAllHosts,
    fetchProjectGroupsForAllHosts,
    fetchReposForAllHosts,
    initialRepoIds,
    mountedRef,
    project,
    repos,
    services,
    servicesChanged,
    target,
    workspace
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
    workspace,
    loading,
    loadError,
    services,
    toggleService,
    repos,
    removeRepo,
    handleAddRepo,
    adding,
    busy,
    error,
    handleSave,
    handleOpenChange
  }
}
