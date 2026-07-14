import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import type { StructuredServiceKind } from '../../../../shared/structured-project-schema'
import { translate } from '@/i18n/i18n'
import { useIterationRepos } from './useIterationRepos'
import type { MountedRepoView, ReposDropHandlers } from './useIterationRepos'
import { materializeAndRefreshStructured } from './structured-materialize-refresh'

export type { MountedRepoView, PendingRepo, ReposDropHandlers } from './useIterationRepos'

// A structured iteration is an on-disk project root (doc + isolated sandbox +
// multiple git-worktree repos). This wizard drives the three iteration.* runtime
// methods in order; disk stays the source of truth, so a partially-completed run
// still leaves a valid project/workspace behind.
export type WizardStep = 'project' | 'workspace' | 'repos'

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
  projectRoot: string
  setProjectRoot: (value: string) => void
  handlePickProjectRoot: () => void
  services: Set<StructuredServiceKind>
  toggleService: (kind: StructuredServiceKind) => void
  workspaceName: string
  setWorkspaceName: (value: string) => void
  workspaceIsFirst: boolean
  mountedRepos: MountedRepoView[]
  busy: boolean
  error: string | null
  clearError: () => void
  createdProject: string
  handleCreateProject: (after: 'workspace' | 'finish') => void
  handleCreateWorkspace: () => void
  handleSkipWorkspace: () => void
  handleAddRepo: () => void
  handleRemovePendingRepo: (source: string) => void
  reposDropTarget: ReturnType<typeof useIterationRepos>['reposDropTarget']
  reposDropHandlers: ReposDropHandlers
  isReposDragOver: boolean
  runMaterializeAndClose: (project: string) => void
  handleOpenChange: (open: boolean) => void
}

export function useStructuredIterationWizard(): StructuredIterationWizard {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData)
  const closeModal = useAppStore((s) => s.closeModal)
  const settings = useAppStore((s) => s.settings)
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
  // Parent directory for the new project root. Empty = let the backend use its
  // default (~/orca/projects). Only meaningful when creating a fresh project.
  const [projectRoot, setProjectRoot] = useState('')
  const [services, setServices] = useState<Set<StructuredServiceKind>>(new Set())
  const [workspaceName, setWorkspaceName] = useState(seededWorkspace)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the workspace step is creating the project's very first workspace.
  // Fresh projects (created in this wizard) always are; a mid-flow re-entry on an
  // existing project fetches the current count to pick a neutral title instead.
  const [workspaceIsFirst, setWorkspaceIsFirst] = useState(true)
  // Captured from the create response, or seeded from modalData on a mid-flow
  // re-entry, so later steps address the exact project the runtime scaffolded.
  const [createdProject, setCreatedProject] = useState(seededProject)
  // True only when this wizard just created the project; a mid-flow re-entry
  // targets a project that already lives in the tree, so skipping there closes
  // without re-materializing.
  const [projectIsNew] = useState(() => readStartStep(modalData.startAt) === 'project')

  const clearError = useCallback(() => setError(null), [])

  // Browse for a parent directory; leaving it empty keeps the backend default.
  // Reuses the same folder picker the repo-mount flow uses.
  const handlePickProjectRoot = useCallback(async () => {
    if (busy) {
      return
    }
    const dir = await window.api.repos.pickDirectory()
    if (dir && mountedRef.current) {
      setProjectRoot(dir)
      clearError()
    }
  }, [busy, clearError, mountedRef])

  // The repos step's state and native folder-drop wiring live in a focused hook;
  // the wizard only orchestrates the step flow and the deferred mount on Done.
  const repos = useIterationRepos({
    isOpen,
    isReposStep: step === 'repos',
    busy,
    setBusy,
    setError,
    target,
    createdProject,
    workspaceName,
    mountedRef
  })

  // On the workspace step, decide whether this is the project's first workspace so
  // the title reads "Create the first workspace" only when it truly is one. A
  // freshly created project has none; a re-entry on an existing project asks disk.
  useEffect(() => {
    if (!isOpen || step !== 'workspace') {
      return
    }
    if (projectIsNew) {
      setWorkspaceIsFirst(true)
      return
    }
    const project = createdProject.trim()
    if (!project) {
      setWorkspaceIsFirst(true)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const result = await callRuntimeRpc<{ project?: { workspaces?: unknown[] } }>(
          target,
          'iteration.get',
          { project }
        )
        if (cancelled || !mountedRef.current) {
          return
        }
        setWorkspaceIsFirst((result.project?.workspaces?.length ?? 0) === 0)
      } catch {
        if (!cancelled && mountedRef.current) {
          setWorkspaceIsFirst(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, step, projectIsNew, createdProject, target, mountedRef])

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
  const mountPendingRepos = repos.mountPendingRepos
  const runMaterializeAndClose = useCallback(
    async (project: string) => {
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
    [closeModal, mountPendingRepos, mountedRef, target]
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
            services: [...services],
            // Empty = backend default (~/orca/projects). The backend joins
            // parentDir + name into the full root.
            parentDir: projectRoot.trim() || undefined
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
    [busy, mountedRef, projectName, projectRoot, runMaterializeAndClose, services, target]
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
    projectRoot,
    setProjectRoot,
    handlePickProjectRoot,
    services,
    toggleService,
    workspaceName,
    setWorkspaceName,
    workspaceIsFirst,
    mountedRepos: repos.mountedRepos,
    busy,
    error,
    clearError,
    createdProject,
    handleCreateProject,
    handleCreateWorkspace,
    handleSkipWorkspace,
    handleAddRepo: repos.handleAddRepo,
    handleRemovePendingRepo: repos.handleRemovePendingRepo,
    reposDropTarget: repos.reposDropTarget,
    reposDropHandlers: repos.reposDropHandlers,
    isReposDragOver: repos.isReposDragOver,
    runMaterializeAndClose,
    handleOpenChange
  }
}
