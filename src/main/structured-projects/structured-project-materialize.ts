// Projects a structured project's on-disk truth into orca's native records so it
// renders in the main WorktreeList like any other project. The mapping:
//   structured project        → top folder-backed ProjectGroup(parentPath=root)
//   workspace                 → nested folder-backed ProjectGroup(createdFrom='structured')
//   workspace overview        → FolderWorkspace(folderPath=wsDir)
//   src repo (shared source)  → orca Repo, attached to the TOP group
// The shared repo's per-workspace worktrees are re-grouped by path in the render
// layer (a single Repo cannot split across workspace groups), so here we only
// attach it once at the top. Every step is idempotent ensure-or-create, keyed on
// disk paths, so startup sync and wizard-finish can both trigger it safely.
import { areRuntimePathsEqual } from '../../shared/worktree-ownership'
import {
  getStructuredProjectMaterializationView,
  listStructuredProjectsService
} from './structured-project-service'
import type { FolderWorkspace, ProjectGroup, Repo, WorktreeMeta } from '../../shared/types'

// Minimal slice of OrcaRuntimeService the materializer needs — declared here so
// the orchestration is unit-testable against a fake runtime.
export type MaterializeRuntime = {
  listProjectGroups: () => ProjectGroup[]
  listFolderWorkspaces: () => FolderWorkspace[]
  createProjectGroup: (input: {
    name: string
    parentPath?: string | null
    parentGroupId?: string | null
    createdFrom?: ProjectGroup['createdFrom']
  }) => Promise<ProjectGroup>
  createFolderWorkspace: (input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
  }) => Promise<FolderWorkspace>
  registerManagedRepo: (source: string) => Promise<string>
  moveProjectToGroup: (
    repoSelector: string,
    groupId: string | null,
    order?: number
  ) => Promise<Repo>
  getWorktreeMeta: (worktreeId: string) => WorktreeMeta | undefined
  setStructuredWorktreeMeta: (worktreeId: string, meta: Partial<WorktreeMeta>) => void
}

export type MaterializeResult = {
  topGroupId: string
  workspaceGroupIds: string[]
  repoIds: string[]
}

async function ensureStructuredGroup(
  runtime: MaterializeRuntime,
  input: { name: string; parentPath: string; parentGroupId: string | null }
): Promise<ProjectGroup> {
  // Only reuse groups we synthesized (createdFrom==='structured'); a plain
  // folder-scan group at the same path lacks the render-layer marker, so we keep
  // our own alongside it rather than adopt it.
  const existing = runtime
    .listProjectGroups()
    .find(
      (group) =>
        group.createdFrom === 'structured' &&
        group.parentGroupId === input.parentGroupId &&
        typeof group.parentPath === 'string' &&
        areRuntimePathsEqual(group.parentPath, input.parentPath)
    )
  if (existing) {
    return existing
  }
  return runtime.createProjectGroup({
    name: input.name,
    parentPath: input.parentPath,
    parentGroupId: input.parentGroupId,
    createdFrom: 'structured'
  })
}

async function ensureOverviewFolderWorkspace(
  runtime: MaterializeRuntime,
  input: { projectGroupId: string; name: string; folderPath: string }
): Promise<FolderWorkspace> {
  const existing = runtime
    .listFolderWorkspaces()
    .find(
      (workspace) =>
        workspace.projectGroupId === input.projectGroupId &&
        areRuntimePathsEqual(workspace.folderPath, input.folderPath)
    )
  if (existing) {
    return existing
  }
  return runtime.createFolderWorkspace({
    projectGroupId: input.projectGroupId,
    name: input.name,
    folderPath: input.folderPath
  })
}

export async function materializeStructuredProject(
  runtime: MaterializeRuntime,
  idOrName: string
): Promise<MaterializeResult> {
  const view = getStructuredProjectMaterializationView(idOrName)

  const topGroup = await ensureStructuredGroup(runtime, {
    name: view.name,
    parentPath: view.rootPath,
    parentGroupId: null
  })

  // Register each shared source repo and pin it under the top group. Render layer
  // splits its worktrees back out per workspace by path. Track member repoId →
  // orca repo UUID so worktree meta below can be keyed to the right Repo record.
  const repoIds: string[] = []
  const orcaRepoIdByMemberRepoId = new Map<string, string>()
  for (const member of view.members) {
    const repoId = await runtime.registerManagedRepo(member.source)
    repoIds.push(repoId)
    orcaRepoIdByMemberRepoId.set(member.repoId, repoId)
    await runtime.moveProjectToGroup(repoId, topGroup.id)
  }

  const workspaceGroupIds: string[] = []
  for (const workspace of view.workspaces) {
    const workspaceGroup = await ensureStructuredGroup(runtime, {
      name: workspace.name,
      parentPath: workspace.wsDir,
      parentGroupId: topGroup.id
    })
    workspaceGroupIds.push(workspaceGroup.id)
    await ensureOverviewFolderWorkspace(runtime, {
      projectGroupId: workspaceGroup.id,
      name: workspace.name,
      folderPath: workspace.wsDir
    })
    // Stamp each worktree as orca-managed. A structured project that predates its
    // orca Repo record (e.g. scanned from disk) has worktree meta without
    // orcaCreatedAt, so shouldShowWorktree treats it as external and hides it
    // (the shared repo is registered with externalWorktreeVisibility:'hide').
    // Backfill the strong marker so it renders. Idempotent: skip if already set.
    for (const worktree of workspace.worktrees) {
      const orcaRepoId = orcaRepoIdByMemberRepoId.get(worktree.repoId)
      if (!orcaRepoId) {
        continue
      }
      const worktreeId = `${orcaRepoId}::${worktree.path}`
      if (runtime.getWorktreeMeta(worktreeId)?.orcaCreatedAt) {
        continue
      }
      runtime.setStructuredWorktreeMeta(worktreeId, {
        orcaCreatedAt: Date.now(),
        orcaCreationSource: 'runtime'
      })
    }
  }

  return { topGroupId: topGroup.id, workspaceGroupIds, repoIds }
}

// Materializes every structured project found on disk. Fail-soft per project so
// one malformed project never blocks the rest (mirrors scanStructuredProjects).
export async function materializeAllStructuredProjects(
  runtime: MaterializeRuntime
): Promise<MaterializeResult[]> {
  const results: MaterializeResult[] = []
  for (const project of listStructuredProjectsService()) {
    try {
      results.push(await materializeStructuredProject(runtime, project.name))
    } catch (error) {
      console.error(`Failed to materialize structured project "${project.name}":`, error)
    }
  }
  return results
}
