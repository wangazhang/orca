// The delete-side dual of materialize: removes orca records that were projected
// from a structured project which no longer exists on disk. A structured project
// is deleted today by removing its directory (there is no in-app delete of the
// materialized graph), so its top/workspace ProjectGroups, overview
// FolderWorkspaces, and registered src repos would otherwise linger as empty
// shells in the sidebar. Reconcile runs at startup (alongside materialize) and
// after an explicit `iteration delete`, keying every decision on disk truth.
import { areRuntimePathsEqual } from '../../shared/worktree-ownership'
import { scanStructuredProjects, scanWorkspaces } from './structured-project-disk'
import { getProjectsDir } from './structured-project-service'
import type { ProjectGroup, Repo } from '../../shared/types'

// Minimal slice of OrcaRuntimeService the reconciler needs — the delete-side
// mirror of MaterializeRuntime, declared here so it is unit-testable against a
// fake runtime.
export type ReconcileRuntime = {
  listProjectGroups: () => ProjectGroup[]
  listRepos: () => Repo[]
  deleteProjectGroup: (groupId: string) => Promise<{ deleted: boolean }>
  removeProject: (repoSelector: string) => Promise<{ removed: true }>
}

export type ReconcileResult = {
  removedGroupIds: string[]
  removedRepoIds: string[]
}

// Set of on-disk paths that are still live, so any structured record whose
// backing path is absent from these sets is an orphan to remove.
type LiveDiskState = {
  roots: string[]
  workspaceDirs: string[]
  sources: string[]
}

function scanLiveDiskState(): LiveDiskState {
  const roots: string[] = []
  const workspaceDirs: string[] = []
  const sources: string[] = []
  for (const project of scanStructuredProjects(getProjectsDir())) {
    roots.push(project.rootPath)
    for (const member of project.project.members) {
      sources.push(member.source)
    }
    for (const workspace of scanWorkspaces(project.rootPath)) {
      workspaceDirs.push(workspace.wsDir)
    }
  }
  return { roots, workspaceDirs, sources }
}

function pathInSet(candidate: string | null | undefined, set: string[]): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false
  }
  return set.some((known) => areRuntimePathsEqual(known, candidate))
}

function isStructuredTop(group: ProjectGroup): boolean {
  return group.createdFrom === 'structured' && group.parentGroupId === null
}

function isStructuredWorkspace(group: ProjectGroup): boolean {
  return group.createdFrom === 'structured' && group.parentGroupId !== null
}

// Collects the given group's id plus every structured descendant group's id, so
// we can find the repos attached anywhere in a top group's subtree.
function collectSubtreeGroupIds(rootId: string, groups: ProjectGroup[]): Set<string> {
  const ids = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const group of groups) {
      if (group.parentGroupId && ids.has(group.parentGroupId) && !ids.has(group.id)) {
        ids.add(group.id)
        grew = true
      }
    }
  }
  return ids
}

export type ReconcileOptions = {
  // Extra source repo paths to unregister if no live structured project still
  // references them. Used by the explicit-delete path to clean repos that were
  // registered by mounting but never materialized under a structured group (so
  // the orphan-group pass alone would not reach them).
  alsoRemoveUnreferencedSources?: string[]
}

export async function reconcileStructuredProjects(
  runtime: ReconcileRuntime,
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const live = scanLiveDiskState()
  const groups = runtime.listProjectGroups()
  const repos = runtime.listRepos()
  const removedGroupIds: string[] = []
  const removedRepoIds: string[] = []

  // 1. Orphan top groups: whole structured project deleted (root path gone).
  //    Deleting the top group cascades its workspace groups + overview folder
  //    workspaces; its shared src repos are only unlinked, so remove them too —
  //    but only when no surviving structured project still mounts that source.
  for (const group of groups) {
    if (!isStructuredTop(group) || pathInSet(group.parentPath, live.roots)) {
      continue
    }
    const subtreeIds = collectSubtreeGroupIds(group.id, groups)
    const attachedRepos = repos.filter(
      (repo) => repo.projectGroupId != null && subtreeIds.has(repo.projectGroupId)
    )
    try {
      const { deleted } = await runtime.deleteProjectGroup(group.id)
      if (deleted) {
        removedGroupIds.push(group.id)
      }
    } catch (error) {
      console.error(`[reconcile] Failed to delete orphan structured group "${group.name}":`, error)
      continue
    }
    for (const repo of attachedRepos) {
      // Reference count: a source shared with a still-live structured project
      // must keep its Repo record.
      if (pathInSet(repo.path, live.sources)) {
        continue
      }
      try {
        await runtime.removeProject(repo.id)
        removedRepoIds.push(repo.id)
      } catch (error) {
        console.error(`[reconcile] Failed to remove orphan structured repo "${repo.path}":`, error)
      }
    }
  }

  // 2. Orphan workspace groups: project survives but one workspace dir was
  //    deleted. Drop just that nested group (cascades its overview folder
  //    workspace); shared repos stay attached to the surviving top group.
  const survivingGroups = runtime.listProjectGroups()
  for (const group of survivingGroups) {
    if (!isStructuredWorkspace(group) || pathInSet(group.parentPath, live.workspaceDirs)) {
      continue
    }
    try {
      const { deleted } = await runtime.deleteProjectGroup(group.id)
      if (deleted) {
        removedGroupIds.push(group.id)
      }
    } catch (error) {
      console.error(
        `[reconcile] Failed to delete orphan structured workspace group "${group.name}":`,
        error
      )
    }
  }

  // 3. Explicit source cleanup (delete path): a mounted-but-unmaterialized repo
  //    is not under any structured group, so pass 1 misses it. Unregister each
  //    named source unless a surviving structured project still references it.
  for (const source of options.alsoRemoveUnreferencedSources ?? []) {
    if (pathInSet(source, live.sources)) {
      continue
    }
    const repo = runtime
      .listRepos()
      .find((candidate) => areRuntimePathsEqual(candidate.path, source))
    if (!repo || removedRepoIds.includes(repo.id)) {
      continue
    }
    try {
      await runtime.removeProject(repo.id)
      removedRepoIds.push(repo.id)
    } catch (error) {
      console.error(`[reconcile] Failed to remove unreferenced structured repo "${source}":`, error)
    }
  }

  return { removedGroupIds, removedRepoIds }
}
