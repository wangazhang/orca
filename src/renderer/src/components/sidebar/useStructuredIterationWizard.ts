import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type {
  StructuredServiceKind,
  StructuredWorkspaceWorktree
} from '../../../../shared/structured-project-schema'
import { translate } from '@/i18n/i18n'

// A structured iteration is an on-disk project root (doc + isolated sandbox +
// multiple git-worktree repos). This wizard drives the three iteration.* runtime
// methods in order; disk stays the source of truth, so a partially-completed run
// still leaves a valid project/workspace behind.
export type WizardStep = 'project' | 'workspace' | 'repos'

// One row in the repos step's mounted-repo list. `isNew` marks repos this wizard
// session just mounted (vs. ones already on the workspace when the step opened),
// so a mid-flow re-entry shows the existing worktrees and freshly added ones side
// by side.
export type MountedRepoView = {
  repoId: string
  branch: string
  isNew: boolean
}

// The sidebar's structured-group "+" buttons reopen this wizard mid-flow via
// modalData: an existing project's top group jumps to 'workspace', a workspace
// group jumps to 'repos'. A plain open (no modalData) starts fresh at 'project'.
function readStartStep(value: unknown): WizardStep {
  return value === 'workspace' || value === 'repos' ? value : 'project'
}

export type StructuredIterationWizard = {
  isOpen: boolean
  step: WizardStep
  projectName: string
  setProjectName: (value: string) => void
  services: Set<StructuredServiceKind>
  toggleService: (kind: StructuredServiceKind) => void
  workspaceName: string
  setWorkspaceName: (value: string) => void
  mountedRepos: MountedRepoView[]
  busy: boolean
  error: string | null
  clearError: () => void
  createdProject: string
  handleCreateProject: (after: 'workspace' | 'finish') => void
  handleCreateWorkspace: () => void
  handleSkipWorkspace: () => void
  handleAddRepo: () => void
  runMaterializeAndClose: (project: string) => void
  handleOpenChange: (open: boolean) => void
}

export function useStructuredIterationWizard(): StructuredIterationWizard {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const settings = useAppStore((s) => s.settings)
  const fetchReposForAllHosts = useAppStore((s) => s.fetchReposForAllHosts)
  const fetchProjectGroupsForAllHosts = useAppStore((s) => s.fetchProjectGroupsForAllHosts)
  const fetchFolderWorkspacesForAllHosts = useAppStore((s) => s.fetchFolderWorkspacesForAllHosts)
  const fetchAllWorktrees = useAppStore((s) => s.fetchAllWorktrees)
  const mountedRef = useMountedRef()

  const isOpen = activeModal === 'structured-iteration'
  const target = useMemo(() => getActiveRuntimeTarget(settings), [settings])

  // App.tsx gate-mounts this wizard only while the modal is open and unmounts it
  // on close, so state seeds from modalData in the lazy initializers on every
  // fresh open — a mid-flow re-entry ('workspace'/'repos') lands on its step with
  // the target project/workspace already filled in.
  const seededProject = typeof modalData.project === 'string' ? modalData.project : ''
  const seededWorkspace = typeof modalData.workspace === 'string' ? modalData.workspace : ''
  const [step, setStep] = useState<WizardStep>(() => readStartStep(modalData.startAt))
  const [projectName, setProjectName] = useState(seededProject)
  const [services, setServices] = useState<Set<StructuredServiceKind>>(new Set())
  const [workspaceName, setWorkspaceName] = useState(seededWorkspace)
  // Split into two sources so the repos step can render the workspace's existing
  // mounts (loaded from disk on entry) alongside the ones added this session,
  // deduped by repoId with the fresh ones flagged.
  const [existingRepos, setExistingRepos] = useState<StructuredWorkspaceWorktree[]>([])
  const [sessionRepos, setSessionRepos] = useState<StructuredWorkspaceWorktree[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Captured from the create response, or seeded from modalData on a mid-flow
  // re-entry, so later steps address the exact project the runtime scaffolded.
  const [createdProject, setCreatedProject] = useState(seededProject)
  // True only when this wizard just created the project; a mid-flow re-entry
  // targets a project that already lives in the tree, so skipping there closes
  // without re-materializing.
  const [projectIsNew] = useState(() => readStartStep(modalData.startAt) === 'project')

  const clearError = useCallback(() => setError(null), [])

  // Best-effort load of the workspace's already-mounted repos from disk (the
  // source of truth is each <ws>/.yoho/workspace.json). Failures are non-fatal:
  // the list just stays with whatever this session mounted, and adding still
  // works. Runs on entering the repos step and after every successful add.
  const refreshMountedRepos = useCallback(async () => {
    const project = createdProject.trim()
    const workspace = workspaceName.trim()
    if (!project || !workspace) {
      setExistingRepos([])
      return
    }
    try {
      const result = await callRuntimeRpc<{
        project?: { workspaces?: { name: string; worktrees: StructuredWorkspaceWorktree[] }[] }
      }>(target, 'iteration.get', { project })
      if (!mountedRef.current) {
        return
      }
      const ws = result.project?.workspaces?.find((entry) => entry.name === workspace)
      setExistingRepos(ws?.worktrees ?? [])
    } catch {
      if (mountedRef.current) {
        setExistingRepos([])
      }
    }
  }, [createdProject, mountedRef, target, workspaceName])

  // Enter the repos step (fresh finish or a mid-flow re-entry) → pull the
  // workspace's existing mounts so they render immediately.
  useEffect(() => {
    if (isOpen && step === 'repos') {
      void refreshMountedRepos()
    }
  }, [isOpen, step, refreshMountedRepos])

  // Existing (disk) mounts first, then this session's additions; a repo present
  // in both (disk already caught up after an add) is shown once, flagged new.
  const mountedRepos = useMemo<MountedRepoView[]>(() => {
    const sessionIds = new Set(sessionRepos.map((repo) => repo.repoId))
    const existing = existingRepos
      .filter((repo) => !sessionIds.has(repo.repoId))
      .map((repo) => ({ repoId: repo.repoId, branch: repo.branch ?? '', isNew: false }))
    const added = sessionRepos.map((repo) => ({
      repoId: repo.repoId,
      branch: repo.branch ?? '',
      isNew: true
    }))
    return [...existing, ...added]
  }, [existingRepos, sessionRepos])

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
  }, [])

  // Project the finished iteration into orca's native records (top group →
  // workspace groups → overview folder workspaces; shared src repos registered +
  // pinned) so it renders in the main WorktreeList. Idempotent, so every exit
  // path (finish, project-only, skip) can share it. Manages busy itself.
  const runMaterializeAndClose = useCallback(
    async (project: string) => {
      setBusy(true)
      setError(null)
      try {
        await callRuntimeRpc(target, 'iteration.materialize', { project })
        // Refresh in the same order App.tsx uses at startup: repos → groups →
        // folder workspaces → worktrees (worktrees enumerate over repos).
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
        translate(
          'auto.components.sidebar.NewStructuredIterationDialog.finishTitle',
          'Structured iteration ready'
        ),
        { description: project }
      )
      closeModal()
    },
    [
      closeModal,
      fetchAllWorktrees,
      fetchFolderWorkspacesForAllHosts,
      fetchProjectGroupsForAllHosts,
      fetchReposForAllHosts,
      mountedRef,
      target
    ]
  )

  const handleCreateProject = useCallback(
    async (after: 'workspace' | 'finish') => {
      const name = projectName.trim()
      if (!name || busy) {
        return
      }
      setBusy(true)
      setError(null)
      let created: string
      try {
        const result = await callRuntimeRpc<{ project: { name: string } }>(
          target,
          'iteration.create',
          {
            name,
            services: [...services]
          }
        )
        created = result.project.name
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
      setCreatedProject(created)
      if (after === 'workspace') {
        setStep('workspace')
        setBusy(false)
      } else {
        // "Create project only": materialize the bare project (no workspace) and
        // close. runMaterializeAndClose keeps busy true through the call.
        await runMaterializeAndClose(created)
      }
    },
    [busy, mountedRef, projectName, runMaterializeAndClose, services, target]
  )

  const handleCreateWorkspace = useCallback(async () => {
    const name = workspaceName.trim()
    if (!name || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callRuntimeRpc(target, 'iteration.workspaceCreate', { project: createdProject, name })
      if (!mountedRef.current) {
        return
      }
      setStep('repos')
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }, [busy, createdProject, mountedRef, target, workspaceName])

  const handleSkipWorkspace = useCallback(() => {
    if (busy) {
      return
    }
    if (projectIsNew) {
      // Fresh project with no workspace yet: still materialize so it appears.
      void runMaterializeAndClose(createdProject)
    } else {
      // Re-entry on an existing project; nothing was added, so just close.
      closeModal()
    }
  }, [busy, closeModal, createdProject, projectIsNew, runMaterializeAndClose])

  const handleAddRepo = useCallback(async () => {
    if (busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (!dir) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await callRuntimeRpc<{ worktree: StructuredWorkspaceWorktree }>(
        target,
        'iteration.workspaceAddRepo',
        { project: createdProject, workspace: workspaceName.trim(), source: dir }
      )
      if (!mountedRef.current) {
        return
      }
      setSessionRepos((prev) => [...prev, result.worktree])
      // Disk is now the source of truth; re-pull so the list reflects the mount
      // exactly (branch, and any repo the runtime resolved differently).
      void refreshMountedRepos()
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }, [busy, createdProject, mountedRef, refreshMountedRepos, target, workspaceName])

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
    step,
    projectName,
    setProjectName,
    services,
    toggleService,
    workspaceName,
    setWorkspaceName,
    mountedRepos,
    busy,
    error,
    clearError,
    createdProject,
    handleCreateProject,
    handleCreateWorkspace,
    handleSkipWorkspace,
    handleAddRepo,
    runMaterializeAndClose,
    handleOpenChange
  }
}
