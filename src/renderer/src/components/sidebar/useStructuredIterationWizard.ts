import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { useIterationRepos } from './useIterationRepos'
import { useSandboxServiceSelection } from './useSandboxServiceSelection'
import { useProjectRepoDrafts } from './useProjectRepoDrafts'
import { useStructuredWizardFinish } from './useStructuredWizardFinish'
import { useWorkspaceIsFirstWorkspace } from './useWorkspaceIsFirstWorkspace'
import {
  STEP_ORDER,
  type StructuredIterationWizard,
  type WizardStep
} from './structured-iteration-wizard-types'

export type {
  MountedRepoView,
  PendingRepo,
  ProjectMemberView,
  ReposDropHandlers
} from './useIterationRepos'
export type { ProjectRepoDraft } from './useProjectRepoDrafts'
export type { StructuredIterationWizard, WizardStep } from './structured-iteration-wizard-types'

// The sidebar's structured-group "+" buttons reopen this wizard mid-flow via
// modalData: an existing project's top group jumps to 'workspace', a workspace
// group jumps to 'repos'. A plain open (no modalData) starts fresh at 'project'.
function readStartStep(value: unknown): WizardStep {
  return value === 'workspace' || value === 'repos' ? value : 'project'
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
  const [startStep] = useState<WizardStep>(() => readStartStep(modalData.startAt))
  const [step, setStep] = useState<WizardStep>(startStep)
  const [projectName, setProjectName] = useState(seededProject)
  // Default the first workspace's name to a version-style seed ("V1") rather
  // than leaving it blank — it reads as an iteration/version the user renames to
  // match the business logic, instead of the opaque derived shortname (e.g.
  // "ITE") the generic name pipeline would otherwise produce.
  const DEFAULT_FIRST_WORKSPACE_NAME = 'V1'
  const [projectRoot, setProjectRoot] = useState('')
  const sandbox = useSandboxServiceSelection({ target })
  const [activePanel, setActivePanel] = useState<'sandbox' | 'repos' | null>(null)
  const [workspaceName, setWorkspaceName] = useState(
    seededWorkspace || (startStep === 'project' ? DEFAULT_FIRST_WORKSPACE_NAME : '')
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdProject, setCreatedProject] = useState(seededProject)
  // Names already scaffolded on disk this run, so stepping Back and forward again
  // advances instead of re-creating (which would fail or duplicate).
  const [committedProject, setCommittedProject] = useState(seededProject)
  const [committedWorkspace, setCommittedWorkspace] = useState(seededWorkspace)
  const [projectIsNew] = useState(() => startStep === 'project')

  const clearError = useCallback(() => setError(null), [])

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

  const revealReposPanel = useCallback(() => setActivePanel('repos'), [])
  const drafts = useProjectRepoDrafts({
    isOpen,
    isProjectStep: step === 'project',
    busy,
    clearError,
    mountedRef,
    onFolderDropped: revealReposPanel
  })

  // The repos step's state and native folder-drop wiring live in a focused hook;
  // the wizard only orchestrates the step flow and the deferred mount on finish.
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

  // Step back one place in the flow. Safe even after a create: the forward
  // handlers no-op when the target already exists on disk.
  const canGoBack = STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(startStep)
  const handleBack = useCallback(() => {
    if (busy) {
      return
    }
    setError(null)
    setStep((prev) => {
      const index = STEP_ORDER.indexOf(prev)
      const floor = STEP_ORDER.indexOf(startStep)
      return index > floor ? STEP_ORDER[index - 1] : prev
    })
  }, [busy, startStep])

  // On the workspace step, decide whether this is the project's first workspace.
  const workspaceIsFirst = useWorkspaceIsFirstWorkspace({
    isOpen,
    isWorkspaceStep: step === 'workspace',
    projectIsNew,
    project: createdProject,
    target,
    mountedRef
  })

  // Auto-detect middleware from whatever repos are known at this point: the
  // project step scans queued local folders, the sandbox step scans the project's
  // full roster (members are always local paths — URL members were cloned first).
  // The selection hook only ever adds suggestions and honors user dismissals.
  const runDetect = sandbox.runDetect
  const localDraftPaths = drafts.localDraftPaths
  const memberPaths = useMemo(
    () => repos.projectMembers.map((member) => member.source),
    [repos.projectMembers]
  )
  useEffect(() => {
    if (!isOpen) {
      return
    }
    if (step === 'project' && localDraftPaths.length > 0) {
      runDetect(localDraftPaths)
      return
    }
    if (step === 'sandbox' && memberPaths.length > 0) {
      runDetect(memberPaths)
    }
  }, [isOpen, step, localDraftPaths, memberPaths, runDetect])

  // Project the finished iteration into orca's native records so it renders in the
  // main WorktreeList; also applies the sandbox picks when finishing.
  const runMaterializeAndClose = useStructuredWizardFinish({
    target,
    workspaceName,
    sandbox,
    mountPendingRepos: repos.mountPendingRepos,
    setBusy,
    setError,
    closeModal,
    mountedRef
  })

  const projectRepoDrafts = drafts.projectRepoDrafts
  const handleCreateProject = useCallback(
    async (after: 'workspace' | 'finish') => {
      const name = projectName.trim()
      if (!name || busy) {
        return
      }
      // Returning here after a Back must not re-create the project.
      if (committedProject && committedProject === name) {
        if (after === 'workspace') {
          setStep('workspace')
        } else {
          await runMaterializeAndClose(committedProject)
        }
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
            services: sandbox.toSpecs(),
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
      setCommittedProject(created)
      // Attach queued project repos as members. A Git URL is cloned by the
      // backend; a local folder is registered in place. Failures surface but don't
      // abort — the project exists and repos can be added later.
      if (projectRepoDrafts.length > 0) {
        try {
          for (const draft of projectRepoDrafts) {
            await callRuntimeRpc(target, 'iteration.addProjectRepo', {
              project: created,
              source: draft.source
            })
          }
        } catch (err) {
          if (mountedRef.current) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }
      }
      if (!mountedRef.current) {
        return
      }
      if (after === 'workspace') {
        setStep('workspace')
        setBusy(false)
      } else {
        // "Create project only": materialize the bare project (no workspace) and
        // close. runMaterializeAndClose keeps busy true through the call.
        await runMaterializeAndClose(created)
      }
    },
    [
      busy,
      committedProject,
      mountedRef,
      projectName,
      projectRepoDrafts,
      projectRoot,
      runMaterializeAndClose,
      sandbox,
      target
    ]
  )

  const handleCreateWorkspace = useCallback(async () => {
    const name = workspaceName.trim()
    if (!name || busy) {
      return
    }
    // Returning here after a Back must not re-create the workspace.
    if (committedWorkspace && committedWorkspace === name) {
      setStep('repos')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await callRuntimeRpc(target, 'iteration.workspaceCreate', { project: createdProject, name })
      if (!mountedRef.current) {
        return
      }
      setCommittedWorkspace(name)
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
  }, [busy, committedWorkspace, createdProject, mountedRef, target, workspaceName])

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

  // Repos step → sandbox step. Nothing is committed yet (mounts are deferred to
  // finish), so this is a pure navigation.
  const handleReposContinue = useCallback(() => {
    if (busy) {
      return
    }
    setError(null)
    setStep('sandbox')
  }, [busy])

  const handleFinish = useCallback(() => {
    void runMaterializeAndClose(createdProject, { applyServices: true })
  }, [createdProject, runMaterializeAndClose])

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeModal()
      }
    },
    [closeModal]
  )

  return {
    ...drafts,
    isOpen,
    step,
    projectName,
    setProjectName,
    projectRoot,
    setProjectRoot,
    handlePickProjectRoot,
    sandbox,
    activePanel,
    setActivePanel,
    workspaceName,
    setWorkspaceName,
    workspaceIsFirst,
    mountedRepos: repos.mountedRepos,
    projectMembers: repos.projectMembers,
    toggleMemberSelected: repos.toggleMemberSelected,
    busy,
    error,
    clearError,
    createdProject,
    canGoBack,
    handleBack,
    handleCreateProject,
    handleCreateWorkspace,
    handleSkipWorkspace,
    handleReposContinue,
    handleAddRepo: repos.handleAddRepo,
    handleRemovePendingRepo: repos.handleRemovePendingRepo,
    reposDropTarget: repos.reposDropTarget,
    reposDropHandlers: repos.reposDropHandlers,
    isReposDragOver: repos.isReposDragOver,
    handleFinish,
    handleOpenChange
  }
}
