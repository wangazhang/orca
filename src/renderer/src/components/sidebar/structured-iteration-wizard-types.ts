import type { MountedRepoView, ProjectMemberView, ReposDropHandlers } from './useIterationRepos'
import type { SandboxServiceSelection } from './useSandboxServiceSelection'
import type { ProjectRepoDrafts } from './useProjectRepoDrafts'

// A structured (multi-repo) project is an on-disk project root: doc + isolated
// sandbox + multiple git-worktree repos. The wizard walks these steps in order;
// disk stays the source of truth, so a partially-completed run still leaves a
// valid project/workspace behind.
export type WizardStep = 'project' | 'workspace' | 'repos' | 'sandbox'

// Forward order; also the order Back walks in reverse.
export const STEP_ORDER: WizardStep[] = ['project', 'workspace', 'repos', 'sandbox']

// The view model the wizard hook exposes to the dialog and its step components.
export type StructuredIterationWizard = ProjectRepoDrafts & {
  isOpen: boolean
  step: WizardStep
  projectName: string
  setProjectName: (value: string) => void
  projectRoot: string
  setProjectRoot: (value: string) => void
  handlePickProjectRoot: () => void
  sandbox: SandboxServiceSelection
  activePanel: 'sandbox' | 'repos' | null
  setActivePanel: (panel: 'sandbox' | 'repos' | null) => void
  workspaceName: string
  setWorkspaceName: (value: string) => void
  workspaceIsFirst: boolean
  mountedRepos: MountedRepoView[]
  projectMembers: ProjectMemberView[]
  toggleMemberSelected: (repoId: string) => void
  busy: boolean
  error: string | null
  clearError: () => void
  createdProject: string
  // True when the current step has a previous step to return to.
  canGoBack: boolean
  handleBack: () => void
  handleCreateProject: (after: 'workspace' | 'finish') => void
  handleCreateWorkspace: () => void
  handleSkipWorkspace: () => void
  handleReposContinue: () => void
  handleAddRepo: () => void
  handleRemovePendingRepo: (source: string) => void
  reposDropTarget: string
  reposDropHandlers: ReposDropHandlers
  isReposDragOver: boolean
  handleFinish: () => void
  handleOpenChange: (open: boolean) => void
}
